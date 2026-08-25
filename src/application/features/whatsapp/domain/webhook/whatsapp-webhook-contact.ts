import { Expose } from 'class-transformer';

export class WhatsAppWebhookContact {
  @Expose({ name: 'wa_id' })
  waId: string;

  @Expose({ name: 'user_id' })
  userId?: string;

  @Expose()
  profile?: { name?: string };
}
