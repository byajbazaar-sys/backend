/** One push notification (title + body; `data` reaches the app when the notification is tapped). */
export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Android notification channel the app created (default: `inbox`, the customer-message alerts). */
  channelId?: string;
}
