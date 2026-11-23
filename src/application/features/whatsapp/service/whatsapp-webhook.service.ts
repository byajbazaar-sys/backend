import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import * as crypto from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  IWhatsAppBusinessConnectionsRepository,
  WHATSAPP_BUSINESS_CONNECTIONS_REPOSITORY,
} from './i-whatsapp-business-connections.repository';
import { IWhatsAppMessagesRepository, WHATSAPP_MESSAGES_REPOSITORY } from './i-whatsapp-messages.repository';
import { MetaWhatsAppOptions } from '../../../shared';
import {
  parseWhatsAppWebhookPayload,
  SaveWhatsAppOutboundMessageData,
  UpdateWhatsAppMessageStatusData,
  WhatsAppWebhookAckResult,
  WhatsAppWebhookMessageStatus,
  WhatsAppWebhookPayload,
  WhatsAppBusinessConnection,
  WhatsAppWebhookContact,
  WhatsAppWebhookInboundMessage,
} from '../domain';
import { parseWhatsAppMessageDeliveryStatus } from '../enums';
import {
  IWhatsAppConversationWindowsRepository,
  WHATSAPP_CONVERSATION_WINDOWS_REPOSITORY,
} from './i-whatsapp-conversation-windows.repository';
import { IWhatsAppRealtimeService, WHATSAPP_REALTIME_SERVICE } from './i-whatsapp-realtime.service';
import { IWhatsAppWebhookService } from './i-whatsapp-webhook.service';
import { EInboxChannel } from '../../inbox/enums';
import { IInboxService, INBOX_SERVICE } from '../../inbox/service/i-inbox.service';
import { META_WHATSAPP_REENGAGEMENT_ERROR_CODE, parseWhatsAppWebhookUnixTimestamp } from '../utils';

@Injectable()
export class WhatsAppWebhookService implements IWhatsAppWebhookService {
  constructor(
    private readonly options: MetaWhatsAppOptions,
    @Inject(WHATSAPP_BUSINESS_CONNECTIONS_REPOSITORY)
    private readonly connectionsRepo: IWhatsAppBusinessConnectionsRepository,
    @Inject(WHATSAPP_CONVERSATION_WINDOWS_REPOSITORY)
    private readonly conversationWindowsRepo: IWhatsAppConversationWindowsRepository,
    @Inject(WHATSAPP_MESSAGES_REPOSITORY)
    private readonly messagesRepo: IWhatsAppMessagesRepository,
    @Inject(WHATSAPP_REALTIME_SERVICE)
    private readonly whatsappRealtime: IWhatsAppRealtimeService,
    @Inject(INBOX_SERVICE) private readonly inbox: IInboxService,
    @InjectPinoLogger(WhatsAppWebhookService.name) private readonly logger: PinoLogger,
  ) {}

  verifySubscription(mode: string | undefined, verifyToken: string | undefined, challenge: string | undefined): string {
    if (!this.options.isWebhookVerifyConfigured) {
      throw new ForbiddenException('WhatsApp webhook verify token is not configured');
    }
    if (mode !== 'subscribe') {
      throw new ForbiddenException('Invalid hub.mode');
    }
    if (!verifyToken || verifyToken !== this.options.webhookVerifyToken) {
      this.logger.warn('WhatsApp webhook verification failed: invalid verify token');
      throw new ForbiddenException('Invalid verify token');
    }
    if (!challenge) {
      throw new ForbiddenException('Missing hub.challenge');
    }
    this.logger.info({ operation: 'verifySubscription' }, 'WhatsApp webhook verified');
    return challenge;
  }

  async handleWebhook(rawBody: string, signature: string | undefined): Promise<WhatsAppWebhookAckResult> {
    if (!this.verifySignature(rawBody, signature)) {
      this.logger.warn('Invalid WhatsApp webhook signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(rawBody);
    } catch {
      throw new UnauthorizedException('Invalid webhook JSON');
    }

    const payload = parseWhatsAppWebhookPayload(rawPayload);
    this.logWebhookMetadata(payload);
    await this.processWebhookInboundMessages(payload);
    await this.processWebhookStatuses(payload);
    return plainToInstance(WhatsAppWebhookAckResult, { received: true }, { excludeExtraneousValues: true });
  }

  private async processWebhookInboundMessages(payload: WhatsAppWebhookPayload): Promise<void> {
    for (const entry of payload.entry ?? []) {
      const wabaId = entry.id;
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const phoneNumberId = value.metadata?.phoneNumberId;
        if (!phoneNumberId || !value.messages?.length) {
          continue;
        }

        const connection = await this.connectionsRepo.findByWabaAndPhoneNumberId(wabaId, phoneNumberId);
        if (!connection) {
          continue;
        }

        for (const message of value.messages) {
          if (!message.from?.trim()) {
            continue;
          }

          const inboundAt = parseWhatsAppWebhookUnixTimestamp(message.timestamp);
          await this.conversationWindowsRepo.recordInboundMessage(
            connection.userId,
            wabaId,
            phoneNumberId,
            message.from,
            inboundAt,
          );

          this.logger.info(
            {
              operation: 'whatsappWebhookInbound',
              userId: connection.userId,
              wabaId,
              phoneNumberId,
              sender: message.from,
              inboundAt: inboundAt.toISOString(),
              messageType: message.type,
            },
            'WhatsApp inbound message recorded for customer service window',
          );
          await this.toInbox(connection.userId, message, value.contacts ?? [], inboundAt);
        }
      }
    }
  }

  /** The customer's message into the business's inbox (the assistant answers it there when it is switched on). */
  private async toInbox(
    userId: string,
    message: WhatsAppWebhookInboundMessage,
    contacts: WhatsAppWebhookContact[],
    receivedAt: Date,
  ): Promise<void> {
    const content = inboxContent(message);
    if (!content || !message.id) return;
    try {
      await this.inbox.receive({
        userId,
        channel: EInboxChannel.WhatsApp,
        externalUserId: message.from.replace(/\D/g, ''),
        customerName: contacts.find((contact) => contact.waId === message.from)?.profile?.name ?? null,
        text: content.text,
        isText: content.isText,
        externalMessageId: message.id,
        receivedAt,
      });
    } catch (err) {
      // The inbox must never make Meta retry the whole webhook (statuses and windows are already recorded).
      this.logger.error({ err, userId, messageId: message.id }, 'WhatsApp message could not reach the inbox');
    }
  }

  private verifySignature(rawBody: string, signature: string | undefined): boolean {
    if (!this.options.isWebhookSignatureConfigured) {
      this.logger.warn('META_APP_SECRET is not configured; rejecting WhatsApp webhook');
      return false;
    }
    if (!signature?.startsWith('sha256=')) {
      return false;
    }

    const expected = crypto.createHmac('sha256', this.options.appSecret).update(rawBody).digest('hex');
    const received = signature.slice('sha256='.length);

    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
    } catch {
      return false;
    }
  }

  private async processWebhookStatuses(payload: WhatsAppWebhookPayload): Promise<void> {
    for (const entry of payload.entry ?? []) {
      const wabaId = entry.id;
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const phoneNumberId = value.metadata?.phoneNumberId;
        if (!phoneNumberId) {
          continue;
        }

        const connection = await this.connectionsRepo.findByWabaAndPhoneNumberId(wabaId, phoneNumberId);
        for (const status of value.statuses ?? []) {
          await this.processStatusEvent(wabaId, phoneNumberId, connection, status);
        }
      }
    }
  }

  private async processStatusEvent(
    wabaId: string,
    phoneNumberId: string,
    connection: WhatsAppBusinessConnection | null,
    status: WhatsAppWebhookMessageStatus,
  ): Promise<void> {
    const deliveryStatus = parseWhatsAppMessageDeliveryStatus(status.status);
    if (!deliveryStatus || !status.id?.trim()) {
      return;
    }

    const metaMessageId = status.id.trim();
    const firstError = status.errors?.[0];
    if (firstError?.code === META_WHATSAPP_REENGAGEMENT_ERROR_CODE) {
      this.logger.warn(
        {
          operation: 'whatsappWebhookStatus',
          wabaId,
          phoneNumberId,
          metaMessageId,
          recipient: status.recipientId,
          errorCode: firstError.code,
          errorTitle: firstError.title,
        },
        'WhatsApp message failed: customer service window closed (131047 re-engagement required)',
      );
    }
    const update = plainToInstance(
      UpdateWhatsAppMessageStatusData,
      {
        deliveryStatus,
        statusTimestamp: status.timestamp,
        errorCode: firstError?.code,
        errorTitle: firstError?.title,
        errorMessage: firstError?.message,
      },
      { excludeExtraneousValues: true },
    );

    let existing = await this.messagesRepo.findByMetaMessageId(metaMessageId);
    if (!existing && connection) {
      existing = await this.messagesRepo.createOutboundMessage(
        plainToInstance(
          SaveWhatsAppOutboundMessageData,
          {
            userId: connection.userId,
            wabaId,
            phoneNumberId,
            metaMessageId,
            recipient: status.recipientId?.replace(/\D/g, '') ?? '',
            deliveryStatus,
            statusTimestamp: status.timestamp,
          },
          { excludeExtraneousValues: true },
        ),
      );
    }

    if (!existing) {
      this.logger.warn(
        {
          operation: 'whatsappWebhookStatus',
          wabaId,
          phoneNumberId,
          metaMessageId,
          deliveryStatus,
        },
        'WhatsApp status webhook received for unknown message',
      );
      return;
    }

    const previousStatus = existing.deliveryStatus;
    const previousErrorCode = existing.errorCode;
    const previousErrorTitle = existing.errorTitle;
    const previousErrorMessage = existing.errorMessage;
    const updated = await this.messagesRepo.applyStatusUpdate(metaMessageId, update);
    const nextStatus = updated?.deliveryStatus ?? previousStatus;

    this.logger.info(
      {
        operation: 'whatsappWebhookStatus',
        userId: existing.userId,
        wabaId,
        phoneNumberId,
        metaMessageId,
        recipient: status.recipientId,
        previousStatus,
        deliveryStatus: nextStatus,
        statusTimestamp: status.timestamp,
        errorCode: firstError?.code,
        errorTitle: firstError?.title,
      },
      previousStatus === nextStatus
        ? 'WhatsApp message delivery status unchanged (idempotent webhook)'
        : 'WhatsApp message delivery status updated',
    );

    const errorDetailsChanged =
      nextStatus === 'failed' &&
      updated != null &&
      (updated.errorCode !== previousErrorCode ||
        updated.errorTitle !== previousErrorTitle ||
        updated.errorMessage !== previousErrorMessage);

    if (updated && (previousStatus !== nextStatus || errorDetailsChanged)) {
      void this.whatsappRealtime.notifyMessageUpdated(updated).catch(() => undefined);
    }
  }

  private logWebhookMetadata(payload: WhatsAppWebhookPayload): void {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const messageTypes = (value.messages ?? []).map((message) => message.type).filter(Boolean);
        const statusEvents = (value.statuses ?? []).map((status) => status.status).filter(Boolean);

        this.logger.info(
          {
            operation: 'whatsappWebhook',
            wabaId: entry.id,
            object: payload.object,
            field: change.field,
            messageTypes,
            statusEvents,
            messageCount: value.messages?.length ?? 0,
            statusCount: value.statuses?.length ?? 0,
            phoneNumberId: value.metadata?.phoneNumberId,
            displayPhoneNumber: value.metadata?.displayPhoneNumber,
            contacts: (value.contacts ?? []).map((contact) => contact.waId),
          },
          'WhatsApp webhook event received',
        );
      }
    }

    if (!payload.entry?.length) {
      this.logger.info({ operation: 'whatsappWebhook', object: payload.object }, 'WhatsApp webhook payload received');
    }
  }
}

/** Text the assistant can read, or a short placeholder for media; null for reactions and system notices. */
function inboxContent(message: WhatsAppWebhookInboundMessage): { text: string; isText: boolean } | null {
  switch (message.type) {
    case 'text':
      return message.text?.body?.trim() ? { text: message.text.body, isText: true } : null;
    case 'button':
      return message.button?.text?.trim() ? { text: message.button.text, isText: true } : null;
    case 'interactive': {
      const title = message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title;
      return title?.trim() ? { text: title, isText: true } : null;
    }
    case 'image':
      return { text: '📷 Photo', isText: false };
    case 'audio':
      return { text: '🎤 Voice message', isText: false };
    case 'video':
      return { text: '🎬 Video', isText: false };
    case 'document':
      return { text: '📄 Document', isText: false };
    case 'sticker':
      return { text: 'Sticker', isText: false };
    case 'location':
      return { text: '📍 Location', isText: false };
    case 'contacts':
      return { text: '👤 Contact card', isText: false };
    default:
      return null; // reaction, system, unsupported
  }
}
