import { Expose, Type } from 'class-transformer';

import { WhatsAppWebhookEntry } from './whatsapp-webhook-entry';

export class WhatsAppWebhookPayload {
  @Expose()
  object: string;

  @Expose()
  @Type(() => WhatsAppWebhookEntry)
  entry: WhatsAppWebhookEntry[];
}
