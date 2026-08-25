import { Expose, Type } from 'class-transformer';

import { WhatsAppWebhookValue } from './whatsapp-webhook-value';

export class WhatsAppWebhookChange {
  @Expose()
  @Type(() => WhatsAppWebhookValue)
  value: WhatsAppWebhookValue;

  @Expose()
  field: string;
}
