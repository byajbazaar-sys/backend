import { Expose, Type } from 'class-transformer';

import { WhatsAppWebhookChange } from './whatsapp-webhook-change';

export class WhatsAppWebhookEntry {
  @Expose()
  id: string;

  @Expose()
  @Type(() => WhatsAppWebhookChange)
  changes: WhatsAppWebhookChange[];
}
