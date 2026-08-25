import { Expose } from 'class-transformer';

import { EWhatsAppConnectionStatus } from '../enums';

export class WhatsAppBusinessConnection {
  @Expose()
  id: string;

  @Expose()
  userId: string;

  @Expose()
  wabaId: string;

  @Expose()
  phoneNumberId: string;

  @Expose()
  displayPhoneNumber?: string;

  @Expose()
  businessName?: string;

  @Expose()
  connectionStatus: EWhatsAppConnectionStatus;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
