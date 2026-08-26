import { Expose } from 'class-transformer';

import { EWhatsAppMessageDeliveryStatus } from '../enums';

export class WhatsAppMessage {
  @Expose()
  id: string;

  @Expose()
  userId: string;

  @Expose()
  wabaId: string;

  @Expose()
  phoneNumberId: string;

  @Expose()
  metaMessageId: string;

  @Expose()
  recipient: string;

  @Expose()
  deliveryStatus: EWhatsAppMessageDeliveryStatus;

  @Expose()
  statusTimestamp?: string;

  @Expose()
  errorCode?: number;

  @Expose()
  errorTitle?: string;

  @Expose()
  errorMessage?: string;

  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;
}
