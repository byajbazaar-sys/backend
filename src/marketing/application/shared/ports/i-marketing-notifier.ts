/** Live updates to the user's open app sessions (ByajBazaar AWS WebSocket). */
export const MARKETING_NOTIFIER = 'MARKETING_NOTIFIER';

export interface IMarketingNotifier {
  notifyUser(userId: string, payload: Record<string, unknown>): Promise<void>;
}
