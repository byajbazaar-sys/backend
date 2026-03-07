import { Paged } from '@shared-libs';
import { Notification } from '../domain';
import { NotificationsFilterOptions } from '../options';

export const NOTIFICATIONS_REPOSITORY = 'INotificationsRepository';

export interface INotificationsRepository {
  create(notification: Notification): Promise<Notification>;
  update(id: string, notification: Partial<Notification>): Promise<Notification>;
  findById(id: string, createdBy?: string): Promise<Notification>;
  listNotifications(params: NotificationsFilterOptions): Promise<Paged<Notification>>;
}
