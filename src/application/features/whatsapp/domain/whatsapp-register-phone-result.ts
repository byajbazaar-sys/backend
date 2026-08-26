import { Expose } from 'class-transformer';

export class WhatsAppRegisterPhoneResult {
  @Expose()
  success: boolean;

  @Expose()
  status: string;
}
