import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AES_ENCRYPT_SERVICE, IAESEncryptService } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { randomBytes } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { IRedisService, REDIS_SERVICE } from '../../../shared/services/i-redis.service';

import {
  WHATSAPP_BILL_PDF_TEMPLATE,
  WHATSAPP_DEFAULT_TEMPLATES,
  WHATSAPP_DEPOSIT_RECEIPT_PDF_TEMPLATE,
  WHATSAPP_PAYMENT_RECEIPT_PDF_TEMPLATE,
} from '../constants/whatsapp-default-template.constants';
import { resolveUploadedPdfMimeType } from '../utils/is-uploaded-pdf.util';
import {
  ConnectWhatsAppBusinessData,
  SaveWhatsAppBusinessConnectionData,
  SaveWhatsAppOutboundMessageData,
  SendWhatsAppTextMessageOptions,
  UpdateWhatsAppSettingsData,
  WhatsAppBusinessConnection,
  WhatsAppDisconnectResult,
  WhatsAppMessage,
  WhatsAppMessageResult,
  WhatsAppOutboundContext,
  WhatsAppRegisterPhoneResult,
  WhatsAppTemplateCreateResult,
} from '../domain';
import {
  EWhatsAppConnectionStatus,
  EWhatsAppMessageContextType,
  EWhatsAppMessageDeliveryStatus,
  EWhatsAppMessageType,
} from '../enums';
import { WhatsAppMessagesFilterOptions } from '../options/whatsapp-messages-filter.options';
import {
  IMetaGraphClient,
  META_GRAPH_CLIENT,
  MetaGraphCredentials,
  MetaTemplateSummary,
} from './i-meta-graph.client';
import {
  IWhatsAppBusinessConnectionsRepository,
  WHATSAPP_BUSINESS_CONNECTIONS_REPOSITORY,
} from './i-whatsapp-business-connections.repository';
import {
  IWhatsAppConversationWindowsRepository,
  WHATSAPP_CONVERSATION_WINDOWS_REPOSITORY,
} from './i-whatsapp-conversation-windows.repository';
import { IWhatsAppMessagesRepository, WHATSAPP_MESSAGES_REPOSITORY } from './i-whatsapp-messages.repository';
import { IWhatsAppRealtimeService, WHATSAPP_REALTIME_SERVICE } from './i-whatsapp-realtime.service';
import { IWhatsAppService } from './i-whatsapp.service';
import { isWithinCustomerServiceWindow, normalizeWhatsAppRecipient } from '../utils/whatsapp-messaging.util';
import {
  evaluateWhatsAppMessagingReadiness,
} from '../utils/whatsapp-display-name.util';

const WHATSAPP_MOBILE_RETURN_SESSION_PREFIX = 'whatsapp:mobile-return:';
const WHATSAPP_MOBILE_RETURN_SESSION_TTL_SECONDS = 600;
const WHATSAPP_ONBOARDING_SESSION_PREFIX = 'whatsapp:onboarding:';
const WHATSAPP_ONBOARDING_SESSION_TTL_SECONDS = 1200;

interface StoredWhatsAppMobileReturnSession {
  userId: string;
  businessId: string;
  createdAt: number;
}

interface StoredWhatsAppOnboardingSession {
  userId: string;
  businessId: string;
  registrationPin: string;
  fromMobileApp: boolean;
  redirectUri?: string;
  createdAt: number;
}

@Injectable()
export class WhatsAppService implements IWhatsAppService {
  private readonly fallbackMobileReturnSessions = new Map<string, StoredWhatsAppMobileReturnSession>();
  private readonly fallbackOnboardingSessions = new Map<string, StoredWhatsAppOnboardingSession>();

  constructor(
    @Inject(META_GRAPH_CLIENT) private readonly metaGraphClient: IMetaGraphClient,
    @Inject(WHATSAPP_BUSINESS_CONNECTIONS_REPOSITORY)
    private readonly connectionsRepo: IWhatsAppBusinessConnectionsRepository,
    @Inject(WHATSAPP_CONVERSATION_WINDOWS_REPOSITORY)
    private readonly conversationWindowsRepo: IWhatsAppConversationWindowsRepository,
    @Inject(WHATSAPP_MESSAGES_REPOSITORY)
    private readonly messagesRepo: IWhatsAppMessagesRepository,
    @Inject(WHATSAPP_REALTIME_SERVICE)
    private readonly whatsappRealtime: IWhatsAppRealtimeService,
    @Inject(AES_ENCRYPT_SERVICE) private readonly aesEncrypt: IAESEncryptService,
    @Inject(REDIS_SERVICE) private readonly redis: IRedisService,
    @InjectPinoLogger(WhatsAppService.name) private readonly logger: PinoLogger,
  ) {}

  async sendTextMessage(
    userId: string,
    businessId: string,
    to: string,
    body: string,
    options?: SendWhatsAppTextMessageOptions,
  ): Promise<WhatsAppMessageResult> {
    return this.sendWhatsAppMessage(userId, businessId, to, body, options);
  }

  async sendTemplateMessage(
    userId: string,
    businessId: string,
    to: string,
    templateName: string,
    languageCode: string,
    parameters: string[],
    outboundContext?: WhatsAppOutboundContext,
  ): Promise<WhatsAppMessageResult> {
    this.assertBusinessAccess(userId, businessId);
    const credentials = await this.resolveCredentials(userId);
    const recipient = normalizeWhatsAppRecipient(to);
    return this.sendWhatsAppTemplate(
      userId,
      credentials,
      recipient,
      templateName,
      languageCode,
      parameters,
      outboundContext,
    );
  }

  async sendBillPdfDocument(
    userId: string,
    businessId: string,
    to: string,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    shopName: string,
    outboundContext?: WhatsAppOutboundContext,
  ): Promise<WhatsAppMessageResult> {
    this.assertBusinessAccess(userId, businessId);
    const connection = await this.connectionsRepo.findByUserId(userId);
    if (!connection || connection.connectionStatus === EWhatsAppConnectionStatus.Disconnected) {
      throw new BadRequestException(
        'WhatsApp is not connected. Connect WhatsApp Business in Account settings before sharing bills.',
      );
    }

    const credentials = await this.resolveCredentials(userId);
    const recipient = normalizeWhatsAppRecipient(to);
    await this.assertMessagingAllowed(userId, credentials);

    const pdfMime = resolveUploadedPdfMimeType(mimeType, filename);
    const mediaId = await this.metaGraphClient.uploadMedia(credentials, fileBuffer, pdfMime, filename);
    const lastInboundAt = await this.conversationWindowsRepo.getLastInboundAt(
      userId,
      credentials.wabaId,
      credentials.phoneNumberId,
      recipient,
    );

    const billContext: WhatsAppOutboundContext = {
      messageType: EWhatsAppMessageType.Document,
      contextType: outboundContext?.contextType ?? EWhatsAppMessageContextType.Bill,
      contextId: outboundContext?.contextId,
      contextLabel: outboundContext?.contextLabel ?? this.buildBillContextLabel(shopName, outboundContext),
    };

    if (isWithinCustomerServiceWindow(lastInboundAt)) {
      const result = await this.metaGraphClient.sendDocumentMessage(credentials, recipient, mediaId, filename);
      await this.persistOutboundMessage(userId, credentials, recipient, result.messageId, billContext);
      return this.buildMessageResult(result.messageId, 'document');
    }

    const billTemplate = WHATSAPP_BILL_PDF_TEMPLATE;
    await this.assertApprovedTemplateExists(userId, billTemplate.name, billTemplate.language);
    const result = await this.metaGraphClient.sendTemplateDocumentMessage(
      credentials,
      recipient,
      billTemplate.name,
      billTemplate.language,
      mediaId,
      filename,
      [shopName.trim() || 'Your shop'],
    );
    await this.persistOutboundMessage(userId, credentials, recipient, result.messageId, {
      ...billContext,
      messageType: EWhatsAppMessageType.Template,
      templateName: billTemplate.name,
    });
    return this.buildMessageResult(result.messageId, 'template', billTemplate.name);
  }

  async sendDepositPdfDocument(
    userId: string,
    businessId: string,
    to: string,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    shopName: string,
    outboundContext?: WhatsAppOutboundContext,
  ): Promise<WhatsAppMessageResult> {
    this.assertBusinessAccess(userId, businessId);
    const connection = await this.connectionsRepo.findByUserId(userId);
    if (!connection || connection.connectionStatus === EWhatsAppConnectionStatus.Disconnected) {
      throw new BadRequestException(
        'WhatsApp is not connected. Connect WhatsApp Business in Account settings before sharing deposit receipts.',
      );
    }

    const credentials = await this.resolveCredentials(userId);
    const recipient = normalizeWhatsAppRecipient(to);
    await this.assertMessagingAllowed(userId, credentials);

    const pdfMime = resolveUploadedPdfMimeType(mimeType, filename);
    const mediaId = await this.metaGraphClient.uploadMedia(credentials, fileBuffer, pdfMime, filename);
    const lastInboundAt = await this.conversationWindowsRepo.getLastInboundAt(
      userId,
      credentials.wabaId,
      credentials.phoneNumberId,
      recipient,
    );

    const depositContext: WhatsAppOutboundContext = {
      messageType: EWhatsAppMessageType.Document,
      contextType: outboundContext?.contextType ?? EWhatsAppMessageContextType.Deposit,
      contextId: outboundContext?.contextId,
      contextLabel: outboundContext?.contextLabel ?? this.buildDepositContextLabel(shopName, outboundContext),
    };

    if (isWithinCustomerServiceWindow(lastInboundAt)) {
      const result = await this.metaGraphClient.sendDocumentMessage(credentials, recipient, mediaId, filename);
      await this.persistOutboundMessage(userId, credentials, recipient, result.messageId, depositContext);
      return this.buildMessageResult(result.messageId, 'document');
    }

    const depositTemplate = WHATSAPP_DEPOSIT_RECEIPT_PDF_TEMPLATE;
    await this.assertApprovedTemplateExists(userId, depositTemplate.name, depositTemplate.language);
    const result = await this.metaGraphClient.sendTemplateDocumentMessage(
      credentials,
      recipient,
      depositTemplate.name,
      depositTemplate.language,
      mediaId,
      filename,
      [shopName.trim() || 'Your shop'],
    );
    await this.persistOutboundMessage(userId, credentials, recipient, result.messageId, {
      ...depositContext,
      messageType: EWhatsAppMessageType.Template,
      templateName: depositTemplate.name,
    });
    return this.buildMessageResult(result.messageId, 'template', depositTemplate.name);
  }

  async sendTransactionPdfDocument(
    userId: string,
    businessId: string,
    to: string,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    shopName: string,
    outboundContext?: WhatsAppOutboundContext,
  ): Promise<WhatsAppMessageResult> {
    this.assertBusinessAccess(userId, businessId);
    const connection = await this.connectionsRepo.findByUserId(userId);
    if (!connection || connection.connectionStatus === EWhatsAppConnectionStatus.Disconnected) {
      throw new BadRequestException(
        'WhatsApp is not connected. Connect WhatsApp Business in Account settings before sharing payment receipts.',
      );
    }

    const credentials = await this.resolveCredentials(userId);
    const recipient = normalizeWhatsAppRecipient(to);
    await this.assertMessagingAllowed(userId, credentials);

    const pdfMime = resolveUploadedPdfMimeType(mimeType, filename);
    const mediaId = await this.metaGraphClient.uploadMedia(credentials, fileBuffer, pdfMime, filename);
    const lastInboundAt = await this.conversationWindowsRepo.getLastInboundAt(
      userId,
      credentials.wabaId,
      credentials.phoneNumberId,
      recipient,
    );

    const transactionContext: WhatsAppOutboundContext = {
      messageType: EWhatsAppMessageType.Document,
      contextType: outboundContext?.contextType ?? EWhatsAppMessageContextType.Transaction,
      contextId: outboundContext?.contextId,
      contextLabel: outboundContext?.contextLabel ?? this.buildTransactionContextLabel(shopName, outboundContext),
    };

    if (isWithinCustomerServiceWindow(lastInboundAt)) {
      const result = await this.metaGraphClient.sendDocumentMessage(credentials, recipient, mediaId, filename);
      await this.persistOutboundMessage(userId, credentials, recipient, result.messageId, transactionContext);
      return this.buildMessageResult(result.messageId, 'document');
    }

    const paymentTemplate = WHATSAPP_PAYMENT_RECEIPT_PDF_TEMPLATE;
    await this.assertApprovedTemplateExists(userId, paymentTemplate.name, paymentTemplate.language);
    const result = await this.metaGraphClient.sendTemplateDocumentMessage(
      credentials,
      recipient,
      paymentTemplate.name,
      paymentTemplate.language,
      mediaId,
      filename,
      [shopName.trim() || 'Your shop'],
    );
    await this.persistOutboundMessage(userId, credentials, recipient, result.messageId, {
      ...transactionContext,
      messageType: EWhatsAppMessageType.Template,
      templateName: paymentTemplate.name,
    });
    return this.buildMessageResult(result.messageId, 'template', paymentTemplate.name);
  }

  /**
   * Sends free-text when the customer service window is open; otherwise sends the configured
   * approved re-engagement template (Meta error 131047 prevention).
   */
  private async sendWhatsAppMessage(
    userId: string,
    businessId: string,
    to: string,
    textBody: string,
    options?: SendWhatsAppTextMessageOptions,
  ): Promise<WhatsAppMessageResult> {
    this.assertBusinessAccess(userId, businessId);
    const credentials = await this.resolveCredentials(userId);
    const recipient = normalizeWhatsAppRecipient(to);
    const lastInboundAt = await this.conversationWindowsRepo.getLastInboundAt(
      userId,
      credentials.wabaId,
      credentials.phoneNumberId,
      recipient,
    );

    if (isWithinCustomerServiceWindow(lastInboundAt)) {
      return this.sendWhatsAppText(userId, credentials, recipient, textBody, {
        contextType: EWhatsAppMessageContextType.Manual,
        contextLabel: textBody.trim().slice(0, 255) || 'Text message',
      });
    }

    const reengagementTemplate = await this.resolveReengagementTemplateFromMeta(userId, options);
    this.logger.info(
      {
        operation: 'sendWhatsAppMessage',
        userId,
        recipient,
        lastInboundAt: lastInboundAt?.toISOString() ?? null,
        templateName: reengagementTemplate.name,
        templateLanguage: reengagementTemplate.language,
      },
      'Customer service window closed; sending approved Meta template instead of free-text',
    );

    return this.sendWhatsAppTemplate(
      userId,
      credentials,
      recipient,
      reengagementTemplate.name,
      reengagementTemplate.language,
      [],
      {
        contextType: EWhatsAppMessageContextType.Manual,
        contextLabel: `Re-engagement · ${reengagementTemplate.name}`,
      },
    );
  }

  private async resolveReengagementTemplateFromMeta(
    userId: string,
    options?: SendWhatsAppTextMessageOptions,
  ): Promise<{ name: string; language: string }> {
    const templateName = options?.reengagementTemplateName?.trim();
    const templateLanguage = options?.reengagementTemplateLanguage?.trim();

    if (!templateName || !templateLanguage) {
      throw new BadRequestException(
        'Outside the 24-hour customer service window. Select an approved template from Meta to re-engage the customer.',
      );
    }

    await this.assertApprovedTemplateExists(userId, templateName, templateLanguage);
    return { name: templateName, language: templateLanguage };
  }

  private async sendWhatsAppText(
    userId: string,
    credentials: MetaGraphCredentials,
    recipient: string,
    body: string,
    outboundContext?: WhatsAppOutboundContext,
  ): Promise<WhatsAppMessageResult> {
    await this.assertMessagingAllowed(userId, credentials);
    const result = await this.metaGraphClient.sendTextMessage(credentials, recipient, body);
    await this.persistOutboundMessage(userId, credentials, recipient, result.messageId, {
      messageType: EWhatsAppMessageType.Text,
      contextType: outboundContext?.contextType ?? EWhatsAppMessageContextType.Manual,
      contextId: outboundContext?.contextId,
      contextLabel: outboundContext?.contextLabel ?? (body.trim().slice(0, 255) || 'Text message'),
    });
    return this.buildMessageResult(result.messageId, 'text');
  }

  private async sendWhatsAppTemplate(
    userId: string,
    credentials: MetaGraphCredentials,
    recipient: string,
    templateName: string,
    languageCode: string,
    parameters: string[],
    outboundContext?: WhatsAppOutboundContext,
  ): Promise<WhatsAppMessageResult> {
    await this.assertMessagingAllowed(userId, credentials);
    const result = await this.metaGraphClient.sendTemplateMessage(
      credentials,
      recipient,
      templateName,
      languageCode,
      parameters,
    );
    await this.persistOutboundMessage(userId, credentials, recipient, result.messageId, {
      messageType: EWhatsAppMessageType.Template,
      templateName,
      contextType: outboundContext?.contextType ?? EWhatsAppMessageContextType.Manual,
      contextId: outboundContext?.contextId,
      contextLabel: outboundContext?.contextLabel ?? templateName,
    });
    return this.buildMessageResult(result.messageId, 'template', templateName);
  }

  private buildMessageResult(
    messageId: string,
    messageType: 'text' | 'template' | 'document',
    templateName?: string,
  ): WhatsAppMessageResult {
    return plainToInstance(
      WhatsAppMessageResult,
      {
        success: true,
        messageId,
        deliveryStatus: EWhatsAppMessageDeliveryStatus.Sent,
        messageType,
        templateName,
      },
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
    if (!data.accessToken?.trim() && !data.code?.trim()) {
      throw new BadRequestException('accessToken or code is required');
    }

    // The OAuth redirect cannot carry the PIN, so recover it from the server-side session.
    const onboardingSessionId = data.onboardingSessionId?.trim();
    let registrationPin = data.registrationPin?.trim();
    let sessionRedirectUri: string | undefined;
    if (onboardingSessionId) {
      const session = await this.readOnboardingSession(onboardingSessionId);
      if (!session) {
        throw new BadRequestException(
          'This WhatsApp onboarding session has expired. Please start the connection again.',
        );
      }
      if (session.userId !== userId || session.businessId !== businessId) {
        throw new ForbiddenException('This WhatsApp onboarding session does not belong to your account.');
      }
      registrationPin = registrationPin || session.registrationPin;
      sessionRedirectUri = session.redirectUri;
    }

    if (!/^\d{6}$/.test(registrationPin ?? '')) {
      throw new BadRequestException('registrationPin must be a 6-digit number');
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
      // The value recorded when the dialog was opened wins — the client can recompute a different
      // pathname/origin after the redirect, which Meta rejects with error subcode 36008.
      const redirectUri = sessionRedirectUri || this.normalizeMetaOAuthRedirectUri(data.redirectUri);
      accessToken = await this.metaGraphClient.exchangeCodeForAccessToken(data.code.trim(), redirectUri || undefined);
    }

    if (!accessToken) {
      throw new BadRequestException('accessToken or code is required');
    }

    const resolved = await this.resolveWabaAndPhoneNumber(accessToken, data);

    await this.ensurePhoneNumberRegistered(accessToken, resolved.phoneNumberId, registrationPin);
    await this.subscribeAppToWaba(accessToken, resolved.wabaId);

    const encryptedToken = this.aesEncrypt.encrypt(accessToken);
    const connectionData = plainToInstance(
      SaveWhatsAppBusinessConnectionData,
      {
        wabaId: resolved.wabaId,
        phoneNumberId: resolved.phoneNumberId,
        displayPhoneNumber: data.displayPhoneNumber?.trim() || resolved.displayPhoneNumber,
        businessName: data.businessName?.trim() || resolved.businessName,
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

    await this.provisionDefaultTemplates(accessToken, saved.wabaId, saved.phoneNumberId);

    if (onboardingSessionId) {
      await this.deleteOnboardingSession(onboardingSessionId);
    }

    return this.enrichConnectionWithMetaProfile(userId, saved);
  }

  /**
   * Mobile browsers often break Embedded Signup's postMessage ("Please close this tab"), so the
   * client can omit wabaId/phoneNumberId. Derive them from the granted token when missing.
   */
  private async resolveWabaAndPhoneNumber(
    accessToken: string,
    data: ConnectWhatsAppBusinessData,
  ): Promise<{ wabaId: string; phoneNumberId: string; displayPhoneNumber?: string; businessName?: string }> {
    const requestedWabaId = data.wabaId?.trim();
    const requestedPhoneNumberId = data.phoneNumberId?.trim();

    if (requestedWabaId && requestedPhoneNumberId) {
      return { wabaId: requestedWabaId, phoneNumberId: requestedPhoneNumberId };
    }

    const candidateWabaIds = requestedWabaId
      ? [requestedWabaId]
      : await this.metaGraphClient.listWabaIdsForToken(accessToken);

    if (candidateWabaIds.length === 0) {
      throw new BadRequestException(
        'Meta did not grant access to any WhatsApp Business Account. Please redo WhatsApp onboarding.',
      );
    }

    for (const wabaId of candidateWabaIds) {
      let phoneNumbers: Awaited<ReturnType<IMetaGraphClient['listWabaPhoneNumbers']>>;
      try {
        phoneNumbers = await this.metaGraphClient.listWabaPhoneNumbers(accessToken, wabaId);
      } catch (err) {
        this.logger.warn(
          { err, operation: 'resolveWabaAndPhoneNumber', wabaId },
          'Failed to list phone numbers for WABA; trying next candidate',
        );
        continue;
      }

      const phone =
        (requestedPhoneNumberId && phoneNumbers.find((item) => item.id === requestedPhoneNumberId)) ||
        phoneNumbers[0];

      if (!phone) {
        continue;
      }

      const businessName = phone.verifiedName ?? (await this.metaGraphClient.getWabaName(accessToken, wabaId));

      this.logger.info(
        {
          operation: 'resolveWabaAndPhoneNumber',
          wabaId,
          phoneNumberId: phone.id,
          discovered: !requestedWabaId || !requestedPhoneNumberId,
        },
        'Resolved WhatsApp Business Account and phone number from Meta token',
      );

      return {
        wabaId,
        phoneNumberId: phone.id,
        displayPhoneNumber: phone.displayPhoneNumber,
        businessName,
      };
    }

    throw new BadRequestException(
      'No WhatsApp phone number was found on your Meta account. Add a number in Meta and try again.',
    );
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
    const result = await this.ensurePhoneNumberRegistered(accessToken, connection.phoneNumberId, registrationPin);
    await this.provisionDefaultTemplates(accessToken, connection.wabaId, connection.phoneNumberId);

    return plainToInstance(WhatsAppRegisterPhoneResult, result, { excludeExtraneousValues: true });
  }

  async getWhatsAppConnection(userId: string, businessId: string): Promise<WhatsAppBusinessConnection> {
    this.assertBusinessAccess(userId, businessId);
    const connection = await this.connectionsRepo.findByUserId(userId);
    if (!connection || connection.connectionStatus === EWhatsAppConnectionStatus.Disconnected) {
      return null;
    }
    return this.enrichConnectionWithMetaProfile(userId, connection);
  }

  async updateWhatsAppSettings(
    userId: string,
    businessId: string,
    data: UpdateWhatsAppSettingsData,
  ): Promise<WhatsAppBusinessConnection> {
    this.assertBusinessAccess(userId, businessId);
    const connection = await this.connectionsRepo.findByUserId(userId);
    if (!connection || connection.connectionStatus === EWhatsAppConnectionStatus.Disconnected) {
      throw new BadRequestException('WhatsApp is not connected for this business');
    }

    if (data.dueRemindersEnabled === undefined) {
      throw new BadRequestException('No WhatsApp settings were provided to update');
    }

    const updated = await this.connectionsRepo.updateSettings(userId, data);
    if (!updated) {
      throw new BadRequestException('WhatsApp is not connected for this business');
    }

    this.logger.info(
      {
        operation: 'updateWhatsAppSettings',
        userId,
        dueRemindersEnabled: data.dueRemindersEnabled,
      },
      'WhatsApp settings updated',
    );

    return updated;
  }

  async getMessageDeliveryStatus(userId: string, businessId: string, metaMessageId: string): Promise<WhatsAppMessage> {
    this.assertBusinessAccess(userId, businessId);
    const message = await this.messagesRepo.findByUserIdAndMetaMessageId(userId, metaMessageId.trim());
    if (!message) {
      throw new NotFoundException('WhatsApp message not found');
    }
    return message;
  }

  async listMessageHistory(
    userId: string,
    businessId: string,
    options: Omit<WhatsAppMessagesFilterOptions, 'userId'>,
  ) {
    this.assertBusinessAccess(userId, businessId);
    return this.messagesRepo.listByUserId({
      userId,
      pageNumber: options.pageNumber,
      pageSize: options.pageSize,
      recipient: options.recipient,
      deliveryStatus: options.deliveryStatus,
      contextType: options.contextType,
    });
  }

  async provisionWhatsAppDefaultTemplates(userId: string, businessId: string): Promise<void> {
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
    await this.provisionDefaultTemplates(accessToken, connection.wabaId, connection.phoneNumberId);
  }

  /**
   * Holds the registration PIN server-side across the Meta OAuth redirect. The returned id is
   * used as the OAuth `state`, so it doubles as CSRF protection without trusting browser storage.
   */
  async createWhatsAppOnboardingSession(
    userId: string,
    businessId: string,
    registrationPin: string,
    fromMobileApp: boolean,
    redirectUri?: string,
  ): Promise<{ sessionId: string; expiresInSeconds: number }> {
    this.assertBusinessAccess(userId, businessId);

    const sessionId = randomBytes(24).toString('base64url');
    await this.storeOnboardingSession(sessionId, {
      userId,
      businessId,
      registrationPin,
      fromMobileApp,
      redirectUri: this.normalizeMetaOAuthRedirectUri(redirectUri) || undefined,
      createdAt: Date.now(),
    });

    this.logger.info(
      { operation: 'createWhatsAppOnboardingSession', userId, businessId, fromMobileApp },
      'Created WhatsApp onboarding session',
    );

    return { sessionId, expiresInSeconds: WHATSAPP_ONBOARDING_SESSION_TTL_SECONDS };
  }

  async getWhatsAppOnboardingSession(
    userId: string,
    sessionId: string,
  ): Promise<{ exists: boolean; fromMobileApp: boolean }> {
    const stored = await this.readOnboardingSession(sessionId.trim());
    if (!stored || stored.userId !== userId) {
      return { exists: false, fromMobileApp: false };
    }
    return { exists: true, fromMobileApp: stored.fromMobileApp };
  }

  async createWhatsAppMobileReturnSession(
    userId: string,
    businessId: string,
  ): Promise<{ sessionId: string; expiresInSeconds: number }> {
    this.assertBusinessAccess(userId, businessId);
    const connection = await this.getWhatsAppConnection(userId, businessId);
    if (!connection || connection.connectionStatus !== EWhatsAppConnectionStatus.Connected) {
      throw new BadRequestException('WhatsApp is not connected yet. Finish onboarding in the browser first.');
    }

    const sessionId = randomBytes(24).toString('base64url');
    const payload: StoredWhatsAppMobileReturnSession = {
      userId,
      businessId,
      createdAt: Date.now(),
    };

    await this.storeMobileReturnSession(sessionId, payload);

    this.logger.info(
      { operation: 'createWhatsAppMobileReturnSession', userId, businessId },
      'Created WhatsApp mobile return session',
    );

    return {
      sessionId,
      expiresInSeconds: WHATSAPP_MOBILE_RETURN_SESSION_TTL_SECONDS,
    };
  }

  async resolveWhatsAppMobileReturnSession(
    userId: string,
    businessId: string,
    sessionId: string,
  ): Promise<{
    status: 'connected' | 'processing' | 'expired' | 'invalid';
    connection?: WhatsAppBusinessConnection | null;
  }> {
    this.assertBusinessAccess(userId, businessId);

    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      return { status: 'invalid', connection: null };
    }

    const stored = await this.readMobileReturnSession(normalizedSessionId);
    if (!stored) {
      return { status: 'invalid', connection: null };
    }

    if (stored.userId !== userId || stored.businessId !== businessId) {
      throw new ForbiddenException('This WhatsApp return session does not belong to your account.');
    }

    const ageMs = Date.now() - stored.createdAt;
    if (ageMs > WHATSAPP_MOBILE_RETURN_SESSION_TTL_SECONDS * 1000) {
      await this.deleteMobileReturnSession(normalizedSessionId);
      return { status: 'expired', connection: null };
    }

    const connection = await this.getWhatsAppConnection(userId, businessId);
    if (connection?.connectionStatus === EWhatsAppConnectionStatus.Connected) {
      await this.deleteMobileReturnSession(normalizedSessionId);
      return { status: 'connected', connection };
    }

    return { status: 'processing', connection: connection ?? null };
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

  private async subscribeAppToWaba(accessToken: string, wabaId: string): Promise<void> {
    try {
      const result = await this.metaGraphClient.subscribeAppToWaba(accessToken, wabaId);
      this.logger.info(
        { operation: 'subscribeAppToWaba', wabaId, success: result.success },
        'WhatsApp app subscribed to WABA for webhook delivery',
      );
    } catch (err) {
      this.logger.warn(
        { err, operation: 'subscribeAppToWaba', wabaId },
        'Failed to subscribe app to WABA; delivery webhooks may not update until retried',
      );
    }
  }

  private async provisionDefaultTemplates(accessToken: string, wabaId: string, phoneNumberId: string): Promise<void> {
    const credentials: MetaGraphCredentials = { accessToken, wabaId, phoneNumberId };

    let templates: MetaTemplateSummary[];
    try {
      templates = await this.metaGraphClient.listMessageTemplates(credentials);
    } catch (err) {
      this.logger.warn(
        { err, operation: 'provisionDefaultTemplates', wabaId },
        'Failed to list WhatsApp templates; skipping default template provisioning',
      );
      return;
    }

    for (const definition of WHATSAPP_DEFAULT_TEMPLATES) {
      const existing = templates.find(
        (template) => template.name === definition.name && template.language === definition.language,
      );

      if (existing) {
        this.logger.info(
          {
            operation: 'provisionDefaultTemplates',
            wabaId,
            templateName: existing.name,
            templateStatus: existing.status,
          },
          'Default WhatsApp template already exists on WABA',
        );
        continue;
      }

      try {
        const created = await this.metaGraphClient.createMessageTemplate(
          credentials,
          definition.name,
          definition.language,
          definition.category,
          definition.bodyText,
          definition.headerFormat,
        );

        this.logger.info(
          {
            operation: 'provisionDefaultTemplates',
            wabaId,
            templateName: definition.name,
            templateId: created.templateId,
            templateStatus: created.status,
          },
          'Default WhatsApp template provisioned on connect',
        );
      } catch (err) {
        this.logger.warn(
          { err, operation: 'provisionDefaultTemplates', wabaId, templateName: definition.name },
          'Failed to provision default WhatsApp template; connect succeeded without it',
        );
      }
    }
  }

  private async assertApprovedTemplateExists(
    userId: string,
    templateName: string,
    templateLanguage: string,
  ): Promise<void> {
    const credentials = await this.resolveCredentials(userId);
    const templates = await this.metaGraphClient.listMessageTemplates(credentials);
    const match = templates.find(
      (template) => template.name === templateName && template.language === templateLanguage,
    );

    if (!match) {
      throw new BadRequestException(
        `Template "${templateName}" (${templateLanguage}) was not found in your WhatsApp Business Account.`,
      );
    }

    if (match.status?.toUpperCase() !== 'APPROVED') {
      throw new BadRequestException(
        `Template "${templateName}" (${templateLanguage}) is ${match.status}. Only approved templates can be used for messaging.`,
      );
    }
  }

  private async assertMessagingAllowed(userId: string, credentials: MetaGraphCredentials): Promise<void> {
    const encryptedToken = await this.connectionsRepo.findEncryptedTokenByUserId(userId);
    if (!encryptedToken) {
      throw new BadRequestException('WhatsApp connection token is missing');
    }

    const accessToken = this.aesEncrypt.decrypt(encryptedToken);
    const connection = await this.connectionsRepo.findByUserId(userId);
    const profile = await this.metaGraphClient.getPhoneNumberStatus(accessToken, credentials.phoneNumberId);
    const readiness = evaluateWhatsAppMessagingReadiness({
      metaPhoneStatus: profile.status,
      displayNameStatus: profile.nameStatus,
      displayPhoneNumber: connection?.displayPhoneNumber || profile.displayPhoneNumber,
    });

    if (!readiness.canSendMessages) {
      throw new BadRequestException(
        readiness.messagingBlockReason ??
          'WhatsApp messaging is blocked until the display name is approved in Meta WhatsApp Manager.',
      );
    }
  }

  private async enrichConnectionWithMetaProfile(
    userId: string,
    connection: WhatsAppBusinessConnection,
  ): Promise<WhatsAppBusinessConnection> {
    const encryptedToken = await this.connectionsRepo.findEncryptedTokenByUserId(userId);
    if (!encryptedToken) {
      return connection;
    }

    try {
      const accessToken = this.aesEncrypt.decrypt(encryptedToken);
      const [profile, wabaInfo] = await Promise.all([
        this.metaGraphClient.getPhoneNumberStatus(accessToken, connection.phoneNumberId),
        this.metaGraphClient.getWhatsAppBusinessAccount(accessToken, connection.wabaId),
      ]);
      const displayPhoneNumber = connection.displayPhoneNumber || profile.displayPhoneNumber || undefined;
      const readiness = evaluateWhatsAppMessagingReadiness({
        metaPhoneStatus: profile.status,
        displayNameStatus: profile.nameStatus,
        displayPhoneNumber,
      });
      const hasPaymentMethod = Boolean(wabaInfo.primaryFundingId);
      const canSendMessages = readiness.canSendMessages && hasPaymentMethod;
      return plainToInstance(
        WhatsAppBusinessConnection,
        {
          ...connection,
          metaPhoneStatus: profile.status || undefined,
          displayNameStatus: profile.nameStatus || undefined,
          verifiedDisplayName: profile.verifiedName || undefined,
          codeVerificationStatus: profile.codeVerificationStatus || undefined,
          displayPhoneNumber,
          canSendMessages,
          messagingBlockReason:
            readiness.messagingBlockReason ??
            (!hasPaymentMethod
              ? 'Add a payment method in Meta WhatsApp Manager before sending messages.'
              : undefined),
          hasPaymentMethod,
        },
        { excludeExtraneousValues: true },
      );
    } catch (err) {
      this.logger.warn(
        {
          err,
          operation: 'enrichConnectionWithMetaProfile',
          userId,
          phoneNumberId: connection.phoneNumberId,
        },
        'Failed to fetch live Meta phone profile for WhatsApp connection',
      );
      return connection;
    }
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

    const retryDelaysMs = [0, 2000, 3000, 4000, 5000];
    let lastError: unknown;

    for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
      if (retryDelaysMs[attempt] > 0) {
        await this.sleep(retryDelaysMs[attempt]);
      }

      try {
        const current = await this.metaGraphClient.getPhoneNumberStatus(accessToken, phoneNumberId);
        if (current.status === 'CONNECTED') {
          this.logger.info(
            { operation: 'ensurePhoneNumberRegistered', phoneNumberId, status: current.status, attempt },
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
      } catch (err) {
        lastError = err;
        const canRetry = attempt < retryDelaysMs.length - 1 && this.isRetryableWhatsAppRegistrationError(err);
        this.logger.warn(
          {
            err,
            operation: 'ensurePhoneNumberRegistered',
            phoneNumberId,
            attempt: attempt + 1,
            willRetry: canRetry,
          },
          'WhatsApp phone registration attempt failed',
        );
        if (!canRetry) {
          throw err;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new BadRequestException('WhatsApp phone registration failed');
  }

  private isRetryableWhatsAppRegistrationError(err: unknown): boolean {
    if (err instanceof ServiceUnavailableException || err instanceof BadGatewayException) {
      return true;
    }

    if (err instanceof BadRequestException) {
      const message = err.message.toLowerCase();
      return (
        message.includes('not verified') ||
        message.includes('not ready') ||
        message.includes('pending') ||
        message.includes('does not exist') ||
        message.includes('invalid parameter') ||
        message.includes('temporarily unavailable') ||
        message.includes('try again')
      );
    }

    if (err instanceof HttpException) {
      const status = err.getStatus();
      return status === 429 || status >= 500;
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildBillContextLabel(shopName: string, outboundContext?: WhatsAppOutboundContext): string {
    if (outboundContext?.contextLabel?.trim()) {
      return outboundContext.contextLabel.trim();
    }
    const parts: string[] = ['Bill PDF'];
    if (shopName?.trim()) {
      parts.push(shopName.trim());
    }
    return parts.join(' · ');
  }

  private buildDepositContextLabel(shopName: string, outboundContext?: WhatsAppOutboundContext): string {
    if (outboundContext?.contextLabel?.trim()) {
      return outboundContext.contextLabel.trim();
    }
    const parts: string[] = ['Deposit receipt'];
    if (shopName?.trim()) {
      parts.push(shopName.trim());
    }
    return parts.join(' · ');
  }

  private buildTransactionContextLabel(shopName: string, outboundContext?: WhatsAppOutboundContext): string {
    if (outboundContext?.contextLabel?.trim()) {
      return outboundContext.contextLabel.trim();
    }
    const parts: string[] = ['Payment receipt'];
    if (shopName?.trim()) {
      parts.push(shopName.trim());
    }
    return parts.join(' · ');
  }

  private async persistOutboundMessage(
    userId: string,
    credentials: MetaGraphCredentials,
    recipient: string,
    metaMessageId: string,
    metadata?: WhatsAppOutboundContext,
  ): Promise<void> {
    const normalizedRecipient = normalizeWhatsAppRecipient(recipient);
    const data = plainToInstance(
      SaveWhatsAppOutboundMessageData,
      {
        userId,
        wabaId: credentials.wabaId,
        phoneNumberId: credentials.phoneNumberId,
        metaMessageId,
        recipient: normalizedRecipient,
        messageType: metadata?.messageType,
        templateName: metadata?.templateName,
        contextType: metadata?.contextType,
        contextId: metadata?.contextId,
        contextLabel: metadata?.contextLabel,
        deliveryStatus: EWhatsAppMessageDeliveryStatus.Sent,
        statusTimestamp: String(Math.floor(Date.now() / 1000)),
      },
      { excludeExtraneousValues: true },
    );

    const saved = await this.messagesRepo.createOutboundMessage(data);
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
    void this.whatsappRealtime.notifyMessageCreated(saved).catch(() => undefined);
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
    if (connection?.connectionStatus !== EWhatsAppConnectionStatus.Connected) {
      throw new BadRequestException('WhatsApp is not connected for this business. Connect your WhatsApp account first.');
    }

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

  private onboardingSessionKey(sessionId: string): string {
    return `${WHATSAPP_ONBOARDING_SESSION_PREFIX}${sessionId}`;
  }

  private async storeOnboardingSession(
    sessionId: string,
    payload: StoredWhatsAppOnboardingSession,
  ): Promise<void> {
    if (this.redis.isEnabled()) {
      await this.redis.setAsync(
        this.onboardingSessionKey(sessionId),
        payload,
        WHATSAPP_ONBOARDING_SESSION_TTL_SECONDS,
      );
      return;
    }

    this.fallbackOnboardingSessions.set(sessionId, payload);
    setTimeout(
      () => this.fallbackOnboardingSessions.delete(sessionId),
      WHATSAPP_ONBOARDING_SESSION_TTL_SECONDS * 1000,
    );
  }

  private async readOnboardingSession(
    sessionId: string,
  ): Promise<StoredWhatsAppOnboardingSession | null> {
    if (!sessionId) return null;

    const stored = this.redis.isEnabled()
      ? await this.redis.getAsync<StoredWhatsAppOnboardingSession>(this.onboardingSessionKey(sessionId))
      : this.fallbackOnboardingSessions.get(sessionId);

    if (!stored) return null;
    if (Date.now() - stored.createdAt > WHATSAPP_ONBOARDING_SESSION_TTL_SECONDS * 1000) {
      await this.deleteOnboardingSession(sessionId);
      return null;
    }
    return stored;
  }

  private async deleteOnboardingSession(sessionId: string): Promise<void> {
    if (this.redis.isEnabled()) {
      await this.redis.deleteAsync(this.onboardingSessionKey(sessionId));
      return;
    }
    this.fallbackOnboardingSessions.delete(sessionId);
  }

  private mobileReturnSessionKey(sessionId: string): string {
    return `${WHATSAPP_MOBILE_RETURN_SESSION_PREFIX}${sessionId}`;
  }

  private async storeMobileReturnSession(
    sessionId: string,
    payload: StoredWhatsAppMobileReturnSession,
  ): Promise<void> {
    const key = this.mobileReturnSessionKey(sessionId);
    if (this.redis.isEnabled()) {
      await this.redis.setAsync(key, payload, WHATSAPP_MOBILE_RETURN_SESSION_TTL_SECONDS);
      return;
    }

    this.fallbackMobileReturnSessions.set(sessionId, payload);
    setTimeout(() => this.fallbackMobileReturnSessions.delete(sessionId), WHATSAPP_MOBILE_RETURN_SESSION_TTL_SECONDS * 1000);
  }

  private async readMobileReturnSession(
    sessionId: string,
  ): Promise<StoredWhatsAppMobileReturnSession | null> {
    const key = this.mobileReturnSessionKey(sessionId);
    if (this.redis.isEnabled()) {
      return (await this.redis.getAsync<StoredWhatsAppMobileReturnSession>(key)) ?? null;
    }

    return this.fallbackMobileReturnSessions.get(sessionId) ?? null;
  }

  private async deleteMobileReturnSession(sessionId: string): Promise<void> {
    const key = this.mobileReturnSessionKey(sessionId);
    if (this.redis.isEnabled()) {
      await this.redis.deleteAsync(key);
      return;
    }

    this.fallbackMobileReturnSessions.delete(sessionId);
  }
}
