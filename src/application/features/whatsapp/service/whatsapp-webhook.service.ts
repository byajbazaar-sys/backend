import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { parseWhatsAppWebhookPayload, WhatsAppWebhookAckResult, WhatsAppWebhookPayload } from '../domain';
import { MetaWhatsAppOptions } from '../../../shared/options/meta-whatsapp.options';
import { IWhatsAppWebhookService } from './i-whatsapp-webhook.service';

@Injectable()
export class WhatsAppWebhookService implements IWhatsAppWebhookService {
  constructor(
    private readonly options: MetaWhatsAppOptions,
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
    return plainToInstance(WhatsAppWebhookAckResult, { received: true }, { excludeExtraneousValues: true });
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

        for (const status of value.statuses ?? []) {
          this.logger.info(
            {
              operation: 'whatsappWebhookStatus',
              wabaId: entry.id,
              messageId: status.id,
              status: status.status,
              recipientId: status.recipientId,
              timestamp: status.timestamp,
              conversationOrigin: status.conversation?.origin?.type,
              pricingCategory: status.pricing?.category,
              billable: status.pricing?.billable,
            },
            'WhatsApp message delivery status update',
          );
        }
      }
    }

    if (!payload.entry?.length) {
      this.logger.info({ operation: 'whatsappWebhook', object: payload.object }, 'WhatsApp webhook payload received');
    }
  }
}
