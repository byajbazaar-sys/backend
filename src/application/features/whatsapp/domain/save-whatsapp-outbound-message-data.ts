import { Expose } from 'class-transformer';

import { EWhatsAppMessageDeliveryStatus } from '../enums';

export class SaveWhatsAppOutboundMessageData {
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
}
