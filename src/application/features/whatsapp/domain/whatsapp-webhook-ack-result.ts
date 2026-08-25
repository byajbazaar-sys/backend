import { Expose } from 'class-transformer';

export class WhatsAppWebhookAckResult {
  @Expose()
  received: boolean;
}
