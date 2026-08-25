import { ENotificationStatus } from '@shared-libs';

export interface NotificationEntityUpdateInput {
  status?: ENotificationStatus;
  externalId?: string;
  errorMessage?: string;
}
