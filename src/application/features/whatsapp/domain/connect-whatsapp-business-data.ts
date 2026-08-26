import { Expose } from 'class-transformer';

export class ConnectWhatsAppBusinessData {
  @Expose()
  wabaId: string;

  @Expose()
  phoneNumberId: string;

  @Expose()
  accessToken?: string;

  @Expose()
  code?: string;

  @Expose()
  redirectUri?: string;

  @Expose()
  displayPhoneNumber?: string;

  @Expose()
  businessName?: string;

  @Expose()
  registrationPin: string;
}
