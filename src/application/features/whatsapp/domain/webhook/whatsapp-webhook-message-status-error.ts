import { Expose } from 'class-transformer';

export class WhatsAppWebhookMessageStatusError {
  @Expose()
  code?: number;

  @Expose()
  title?: string;

  @Expose()
  message?: string;
}
