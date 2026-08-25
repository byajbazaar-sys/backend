import { Expose } from 'class-transformer';

export class ConnectWhatsAppBusinessData {
  @Expose()
  wabaId: string;

  @Expose()
  phoneNumberId: string;

  @Expose()
  accessToken: string;

  @Expose()
  displayPhoneNumber?: string;

  @Expose()
  businessName?: string;
}
