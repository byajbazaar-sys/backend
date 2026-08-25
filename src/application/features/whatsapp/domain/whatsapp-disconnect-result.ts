import { Expose } from 'class-transformer';

export class WhatsAppDisconnectResult {
  @Expose()
  success: boolean;
}
