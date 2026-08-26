import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { AES_ENCRYPT_SERVICE, IAESEncryptService } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { MetaWhatsAppOptions } from '../../../shared';
import {
  ConnectWhatsAppBusinessData,
  SaveWhatsAppBusinessConnectionData,
  WhatsAppBusinessConnection,
  WhatsAppDisconnectResult,
  WhatsAppMessageResult,
  WhatsAppTemplateCreateResult,
} from '../domain';
import { EWhatsAppConnectionStatus } from '../enums';
import { IMetaGraphClient, META_GRAPH_CLIENT, MetaGraphCredentials, MetaTemplateSummary } from './i-meta-graph.client';
import {
  IWhatsAppBusinessConnectionsRepository,
  WHATSAPP_BUSINESS_CONNECTIONS_REPOSITORY,
} from './i-whatsapp-business-connections.repository';
import { IWhatsAppService } from './i-whatsapp.service';

@Injectable()
export class WhatsAppService implements IWhatsAppService {
  constructor(
    private readonly options: MetaWhatsAppOptions,
    @Inject(META_GRAPH_CLIENT) private readonly metaGraphClient: IMetaGraphClient,
    @Inject(WHATSAPP_BUSINESS_CONNECTIONS_REPOSITORY)
    private readonly connectionsRepo: IWhatsAppBusinessConnectionsRepository,
    @Inject(AES_ENCRYPT_SERVICE) private readonly aesEncrypt: IAESEncryptService,
    @InjectPinoLogger(WhatsAppService.name) private readonly logger: PinoLogger,
  ) {}

  async sendTextMessage(
    userId: string,
    businessId: string,
    to: string,
    body: string,
  ): Promise<WhatsAppMessageResult> {
    this.assertBusinessAccess(userId, businessId);
    const credentials = await this.resolveCredentials(userId);
    const result = await this.metaGraphClient.sendTextMessage(credentials, to, body);
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

  async getWhatsAppConnection(userId: string, businessId: string): Promise<WhatsAppBusinessConnection> {
    this.assertBusinessAccess(userId, businessId);
    const connection = await this.connectionsRepo.findByUserId(userId);
    if (!connection || connection.connectionStatus === EWhatsAppConnectionStatus.Disconnected) {
      return null;
    }
    return connection;
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
