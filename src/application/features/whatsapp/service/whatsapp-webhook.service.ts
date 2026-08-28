import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import * as crypto from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  IWhatsAppBusinessConnectionsRepository,
  WHATSAPP_BUSINESS_CONNECTIONS_REPOSITORY,
} from './i-whatsapp-business-connections.repository';
import { IWhatsAppMessagesRepository, WHATSAPP_MESSAGES_REPOSITORY } from './i-whatsapp-messages.repository';
import { MetaWhatsAppOptions } from '../../../shared/options/meta-whatsapp.options';
import { META_WHATSAPP_REENGAGEMENT_ERROR_CODE } from '../constants/whatsapp-messaging.constants';
import {
  parseWhatsAppWebhookPayload,
  SaveWhatsAppOutboundMessageData,
  UpdateWhatsAppMessageStatusData,
  WhatsAppWebhookAckResult,
  WhatsAppWebhookMessageStatus,
  WhatsAppWebhookPayload,
} from '../domain';
import { WhatsAppBusinessConnection } from '../domain/whatsapp-business-connection';
import { parseWhatsAppMessageDeliveryStatus } from '../enums';
import {
  IWhatsAppConversationWindowsRepository,
  WHATSAPP_CONVERSATION_WINDOWS_REPOSITORY,
} from './i-whatsapp-conversation-windows.repository';
import { IWhatsAppWebhookService } from './i-whatsapp-webhook.service';
import { parseWhatsAppWebhookUnixTimestamp } from '../utils/whatsapp-messaging.util';

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
        }
      }
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
