import { Expose } from 'class-transformer';

export class WhatsAppMessageResult {
  @Expose()
  success: boolean;

  @Expose()
  messageId: string;
}
