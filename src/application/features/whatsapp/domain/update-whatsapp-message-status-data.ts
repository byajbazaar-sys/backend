import { Expose } from 'class-transformer';

import { EWhatsAppMessageDeliveryStatus } from '../enums';

export class UpdateWhatsAppMessageStatusData {
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
}
