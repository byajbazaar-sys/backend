import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AES_ENCRYPT_SERVICE, IAESEncryptService } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { MetaWhatsAppOptions } from '../../../shared';
import {
  ConnectWhatsAppBusinessData,
  SaveWhatsAppBusinessConnectionData,
  SaveWhatsAppOutboundMessageData,
  WhatsAppBusinessConnection,
  WhatsAppDisconnectResult,
  WhatsAppMessage,
  WhatsAppMessageResult,
  WhatsAppRegisterPhoneResult,
  WhatsAppTemplateCreateResult,
} from '../domain';
import { EWhatsAppConnectionStatus, EWhatsAppMessageDeliveryStatus } from '../enums';
import { IMetaGraphClient, META_GRAPH_CLIENT, MetaGraphCredentials, MetaTemplateSummary } from './i-meta-graph.client';
import {
  IWhatsAppBusinessConnectionsRepository,
  WHATSAPP_BUSINESS_CONNECTIONS_REPOSITORY,
} from './i-whatsapp-business-connections.repository';
import { IWhatsAppMessagesRepository, WHATSAPP_MESSAGES_REPOSITORY } from './i-whatsapp-messages.repository';
import { IWhatsAppService } from './i-whatsapp.service';

@Injectable()
export class WhatsAppService implements IWhatsAppService {
  constructor(
    private readonly options: MetaWhatsAppOptions,
    @Inject(META_GRAPH_CLIENT) private readonly metaGraphClient: IMetaGraphClient,
    @Inject(WHATSAPP_BUSINESS_CONNECTIONS_REPOSITORY)
    private readonly connectionsRepo: IWhatsAppBusinessConnectionsRepository,
    @Inject(WHATSAPP_MESSAGES_REPOSITORY)
    private readonly messagesRepo: IWhatsAppMessagesRepository,
    @Inject(AES_ENCRYPT_SERVICE) private readonly aesEncrypt: IAESEncryptService,
    @InjectPinoLogger(WhatsAppService.name) private readonly logger: PinoLogger,
  ) { }

  async sendTextMessage(
    userId: string,
    businessId: string,
    to: string,
    body: string,
  ): Promise<WhatsAppMessageResult> {
    this.assertBusinessAccess(userId, businessId);
    const credentials = await this.resolveCredentials(userId);
    const result = await this.metaGraphClient.sendTextMessage(credentials, to, body);
    await this.persistOutboundMessage(userId, credentials, to, result.messageId);
    return plainToInstance(
      WhatsAppMessageResult,
      { success: true, messageId: result.messageId },
      { excludeExtraneousValues: true },
    );
  }

  async sendTemplateMessage(
    userId: string,
    businessId: string,
    to: string,
    templateName: string,
    languageCode: string,
    parameters: string[],
  ): Promise<WhatsAppMessageResult> {
    this.assertBusinessAccess(userId, businessId);
    const credentials = await this.resolveCredentials(userId);
    const result = await this.metaGraphClient.sendTemplateMessage(
      credentials,
      to,
      templateName,
      languageCode,
      parameters,
    );
    await this.persistOutboundMessage(userId, credentials, to, result.messageId);
    return plainToInstance(
      WhatsAppMessageResult,
      { success: true, messageId: result.messageId },
      { excludeExtraneousValues: true },
    );
  }

  async createTemplate(
    userId: string,
    businessId: string,
    name: string,
    language: string,
    category: string,
    bodyText: string,
  ): Promise<WhatsAppTemplateCreateResult> {
    this.assertBusinessAccess(userId, businessId);
    const credentials = await this.resolveCredentials(userId);
    const result = await this.metaGraphClient.createMessageTemplate(credentials, name, language, category, bodyText);
    return plainToInstance(
      WhatsAppTemplateCreateResult,
      { success: true, templateId: result.templateId, status: result.status },
      { excludeExtraneousValues: true },
    );
  }

  async listTemplates(userId: string, businessId: string): Promise<MetaTemplateSummary[]> {
    this.assertBusinessAccess(userId, businessId);
    const credentials = await this.resolveCredentials(userId);
    return this.metaGraphClient.listMessageTemplates(credentials);
  }

  async connectWhatsAppBusiness(
    userId: string,
    businessId: string,
    data: ConnectWhatsAppBusinessData,
  ): Promise<WhatsAppBusinessConnection> {
    this.assertBusinessAccess(userId, businessId);
    if (!data.wabaId?.trim() || !data.phoneNumberId?.trim()) {
      throw new BadRequestException('wabaId and phoneNumberId are required');
    }

    let accessToken: string | undefined;
    const shortLivedToken = data.accessToken?.trim();
    if (shortLivedToken) {
      try {
        accessToken = await this.metaGraphClient.exchangeShortLivedUserToken(shortLivedToken);
      } catch (err) {
        this.logger.warn(
          { err, operation: 'connectWhatsAppBusiness' },
          'Long-lived token exchange failed; storing short-lived Embedded Signup token',
        );
        accessToken = shortLivedToken;
      }
    } else if (data.code?.trim()) {
      const redirectUri = this.normalizeMetaOAuthRedirectUri(data.redirectUri);
      accessToken = await this.metaGraphClient.exchangeCodeForAccessToken(data.code.trim(), redirectUri || undefined);
    }

    if (!accessToken) {
      throw new BadRequestException('accessToken or code is required');
    }

    await this.ensurePhoneNumberRegistered(accessToken, data.phoneNumberId.trim(), data.registrationPin);

    const encryptedToken = this.aesEncrypt.encrypt(accessToken);
    const connectionData = plainToInstance(
      SaveWhatsAppBusinessConnectionData,
      {
        wabaId: data.wabaId.trim(),
        phoneNumberId: data.phoneNumberId.trim(),
        displayPhoneNumber: data.displayPhoneNumber,
        businessName: data.businessName,
      },
      { excludeExtraneousValues: true },
    );

    const saved = await this.connectionsRepo.upsertConnection(userId, connectionData, encryptedToken);
    this.logger.info(
      {
        operation: 'connectWhatsAppBusiness',
        userId,
        wabaId: saved.wabaId,
        phoneNumberId: saved.phoneNumberId,
      },
      'WhatsApp business connection stored',
    );
    return saved;
  }

  async registerWhatsAppPhone(
    userId: string,
    businessId: string,
    registrationPin: string,
  ): Promise<WhatsAppRegisterPhoneResult> {
    this.assertBusinessAccess(userId, businessId);
    const connection = await this.connectionsRepo.findByUserId(userId);
    if (!connection || connection.connectionStatus === EWhatsAppConnectionStatus.Disconnected) {
      throw new BadRequestException('WhatsApp is not connected for this business');
    }

    const encryptedToken = await this.connectionsRepo.findEncryptedTokenByUserId(userId);
    if (!encryptedToken) {
      throw new BadRequestException('WhatsApp connection token is missing');
    }

    const accessToken = this.aesEncrypt.decrypt(encryptedToken);
    const result = await this.ensurePhoneNumberRegistered(
      accessToken,
      connection.phoneNumberId,
      registrationPin,
    );

    return plainToInstance(WhatsAppRegisterPhoneResult, result, { excludeExtraneousValues: true });
  }

  async getWhatsAppConnection(userId: string, businessId: string): Promise<WhatsAppBusinessConnection> {
    this.assertBusinessAccess(userId, businessId);
    const connection = await this.connectionsRepo.findByUserId(userId);
    if (!connection || connection.connectionStatus === EWhatsAppConnectionStatus.Disconnected) {
      return null;
    }
    return connection;
  }

  async getMessageDeliveryStatus(
    userId: string,
    businessId: string,
    metaMessageId: string,
  ): Promise<WhatsAppMessage> {
    this.assertBusinessAccess(userId, businessId);
    const message = await this.messagesRepo.findByUserIdAndMetaMessageId(userId, metaMessageId.trim());
    if (!message) {
      throw new NotFoundException('WhatsApp message not found');
    }
    return message;
  }

  async disconnectWhatsAppBusiness(userId: string, businessId: string): Promise<WhatsAppDisconnectResult> {
    this.assertBusinessAccess(userId, businessId);
    const connection = await this.connectionsRepo.findByUserId(userId);
    if (!connection || connection.connectionStatus === EWhatsAppConnectionStatus.Disconnected) {
      throw new BadRequestException('WhatsApp is not connected for this business');
    }
    await this.connectionsRepo.updateStatus(userId, EWhatsAppConnectionStatus.Disconnected);
    this.logger.info({ operation: 'disconnectWhatsAppBusiness', userId }, 'WhatsApp business connection disconnected');
    return plainToInstance(WhatsAppDisconnectResult, { success: true }, { excludeExtraneousValues: true });
  }

  private async ensurePhoneNumberRegistered(
    accessToken: string,
    phoneNumberId: string,
    registrationPin: string,
  ): Promise<WhatsAppRegisterPhoneResult> {
    const pin = registrationPin?.trim();
    if (!/^\d{6}$/.test(pin)) {
      throw new BadRequestException('registrationPin must be a 6-digit number');
    }

    const current = await this.metaGraphClient.getPhoneNumberStatus(accessToken, phoneNumberId);
    if (current.status === 'CONNECTED') {
      this.logger.info(
        { operation: 'ensurePhoneNumberRegistered', phoneNumberId, status: current.status },
        'WhatsApp phone number already registered with Cloud API',
      );
      return plainToInstance(
        WhatsAppRegisterPhoneResult,
        { success: true, status: current.status },
        { excludeExtraneousValues: true },
      );
    }

    const registered = await this.metaGraphClient.registerPhoneNumber(accessToken, phoneNumberId, pin);
    return plainToInstance(WhatsAppRegisterPhoneResult, registered, { excludeExtraneousValues: true });
  }

  private async persistOutboundMessage(
    userId: string,
    credentials: MetaGraphCredentials,
    recipient: string,
    metaMessageId: string,
  ): Promise<void> {
    const normalizedRecipient = recipient.replace(/\D/g, '');
    const data = plainToInstance(
      SaveWhatsAppOutboundMessageData,
      {
        userId,
        wabaId: credentials.wabaId,
        phoneNumberId: credentials.phoneNumberId,
        metaMessageId,
        recipient: normalizedRecipient,
        deliveryStatus: EWhatsAppMessageDeliveryStatus.Sent,
        statusTimestamp: String(Math.floor(Date.now() / 1000)),
      },
      { excludeExtraneousValues: true },
    );

    await this.messagesRepo.createOutboundMessage(data);
    this.logger.info(
      {
        operation: 'sendWhatsAppMessage',
        userId,
        wabaId: credentials.wabaId,
        phoneNumberId: credentials.phoneNumberId,
        metaMessageId,
        recipient: normalizedRecipient,
        deliveryStatus: EWhatsAppMessageDeliveryStatus.Sent,
      },
      'WhatsApp outbound message accepted by Meta',
    );
  }

  /** Strip query/hash so token exchange matches Meta OAuth redirect_uri (pathname only). */
  private normalizeMetaOAuthRedirectUri(redirectUri: string | undefined): string {
    const trimmed = redirectUri?.trim();
    if (!trimmed) return '';

    try {
      const parsed = new URL(trimmed);
      parsed.search = '';
      parsed.hash = '';
      let normalized = parsed.toString();
      if (parsed.pathname !== '/' && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return trimmed.split('#')[0]?.split('?')[0]?.replace(/\/$/, '') ?? trimmed;
    }
  }

  private assertBusinessAccess(userId: string, businessId: string): void {
    if (businessId !== userId) {
      throw new ForbiddenException('You do not have access to this business');
    }
  }

  private async resolveCredentials(userId: string): Promise<MetaGraphCredentials> {
    const connection = await this.connectionsRepo.findByUserId(userId);
    if (connection?.connectionStatus === EWhatsAppConnectionStatus.Connected) {
      const encryptedToken = await this.connectionsRepo.findEncryptedTokenByUserId(userId);
      if (!encryptedToken) {
        throw new BadRequestException('WhatsApp connection token is missing');
      }
      const accessToken = this.aesEncrypt.decrypt(encryptedToken);
      return {
        accessToken,
        phoneNumberId: connection.phoneNumberId,
        wabaId: connection.wabaId,
      };
    }

    if (!this.options.isTestConfigured) {
      throw new BadRequestException(
        'WhatsApp is not configured for this business. Connect a WhatsApp account or configure Meta test credentials.',
      );
    }

    this.logger.debug({ userId, operation: 'resolveCredentials' }, 'Using Meta test WhatsApp credentials');
    return {
      accessToken: this.options.testAccessToken,
      phoneNumberId: this.options.testPhoneNumberId,
      wabaId: this.options.testWabaId,
    };
  }
}
