import { Expose, Type } from 'class-transformer';

import { WhatsAppWebhookConversation } from './whatsapp-webhook-conversation';
import { WhatsAppWebhookPricing } from './whatsapp-webhook-pricing';

export class WhatsAppWebhookMessageStatus {
  @Expose()
  id: string;

  @Expose()
  status: string;

  @Expose()
  timestamp: string;

  @Expose({ name: 'recipient_id' })
  recipientId: string;

  @Expose({ name: 'recipient_logical_id' })
  recipientLogicalId?: string;

  @Expose({ name: 'recipient_user_id' })
  recipientUserId?: string;

  @Expose()
  @Type(() => WhatsAppWebhookConversation)
  conversation?: WhatsAppWebhookConversation;

  @Expose()
  @Type(() => WhatsAppWebhookPricing)
  pricing?: WhatsAppWebhookPricing;
}
