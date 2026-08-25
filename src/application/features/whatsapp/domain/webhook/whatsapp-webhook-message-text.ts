import { Expose } from 'class-transformer';

export class WhatsAppWebhookMessageText {
  @Expose()
  body: string;
}
