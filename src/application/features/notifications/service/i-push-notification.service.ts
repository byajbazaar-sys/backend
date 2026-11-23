import { PushMessage } from '../domain';

export const PUSH_NOTIFICATION_SERVICE = 'PUSH_NOTIFICATION_SERVICE';

export interface IPushNotificationService {
  /** Sends to every registered device of the user; returns how many devices accepted it. Never throws. */
  sendToUser(userId: string, message: PushMessage): Promise<number>;
}
