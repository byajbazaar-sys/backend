import { Paged } from '@shared-libs';

import { Notification } from '../domain';
import { SendEmailRequestModel } from '../models';
import { NotificationsFilterOptions } from '../options';

export const NOTIFICATION_SERVICE = 'INotificationService';

export interface INotificationService {
  sendEmail(data: SendEmailRequestModel, createdBy?: string): Promise<Notification>;
  getById(id: string, createdBy?: string): Promise<Notification>;
  listNotifications(params: NotificationsFilterOptions): Promise<Paged<Notification>>;
}
