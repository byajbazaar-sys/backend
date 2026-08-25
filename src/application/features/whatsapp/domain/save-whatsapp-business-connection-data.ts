import { Expose } from 'class-transformer';

export class SaveWhatsAppBusinessConnectionData {
  @Expose()
  wabaId: string;

  @Expose()
  phoneNumberId: string;

  @Expose()
  displayPhoneNumber?: string;

  @Expose()
  businessName?: string;
}
