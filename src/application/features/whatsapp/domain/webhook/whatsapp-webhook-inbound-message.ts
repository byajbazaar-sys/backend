import { Expose, Type } from 'class-transformer';

import { WhatsAppWebhookMessageText } from './whatsapp-webhook-message-text';

export class WhatsAppWebhookInboundMessage {
  @Expose()
  from: string;

  @Expose()
  id: string;

  @Expose()
  timestamp: string;

  @Expose()
  type: string;

  @Expose()
  @Type(() => WhatsAppWebhookMessageText)
  text?: WhatsAppWebhookMessageText;
}
