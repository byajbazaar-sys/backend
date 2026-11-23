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

  /** A tap on a template's quick-reply button. */
  @Expose()
  button?: { text?: string; payload?: string };

  /** A tap on an interactive message's reply button or list row. */
  @Expose()
  interactive?: { type?: string; button_reply?: { title?: string }; list_reply?: { title?: string } };
}
