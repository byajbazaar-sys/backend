import { ENotificationStatus } from '@shared-libs';
import { Expose } from 'class-transformer';

export class NotificationDeliveryPatch {
  @Expose()
  status?: ENotificationStatus;

  @Expose()
  externalId?: string;

  @Expose()
  errorMessage?: string;
}
