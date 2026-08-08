import { Paged } from '@shared-libs';
import { Notification } from '../domain';
import { NotificationDeliveryPatch } from '../models';
import { NotificationsFilterOptions } from '../options';

export const NOTIFICATIONS_REPOSITORY = 'INotificationsRepository';

export interface INotificationsRepository {
  create(notification: Notification): Promise<Notification>;
  update(id: string, notification: NotificationDeliveryPatch): Promise<Notification>;
  findById(id: string, createdBy?: string): Promise<Notification>;
  listNotifications(params: NotificationsFilterOptions): Promise<Paged<Notification>>;
}
