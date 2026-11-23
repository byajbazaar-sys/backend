export const MARKETING_INBOX = 'MARKETING_INBOX';

/** A customer's Instagram DM, for the business's customer inbox. */
export interface MarketingInboxMessage {
  userId: string;
  /** The customer's Instagram-scoped ID (IGSID): replies go to it. */
  customerId: string;
  customerName: string | null;
  /** The text, or a short label for a photo, voice note or shared post. */
  text: string;
  /** False for photos, voice notes and other attachments the assistant cannot read. */
  isText: boolean;
  /** Meta's message ID (mid); a webhook delivered twice is stored once. */
  messageId: string;
  receivedAt: Date;
}

/** Whether Instagram can carry the inbox's replies for a business, and what to do when it cannot. */
export interface MarketingInboxStatus {
  connected: boolean;
  ready: boolean;
  reason?: string;
}

/** Sends the inbox's Instagram replies: marketing holds the Instagram login, so it sends them. */
export interface MarketingInstagramReplies {
  /** `by: 'owner'` may use Meta's human-agent tag (a person's reply after the normal 24 hours). */
  send(userId: string, customerId: string, text: string, by: 'bot' | 'owner'): Promise<{ messageId: string | null }>;
  status(userId: string): Promise<MarketingInboxStatus>;
  /** When the owner switches Instagram replies on: link the Facebook Page and subscribe it to message webhooks. */
  prepare(userId: string): Promise<MarketingInboxStatus>;
}

/** ByajBazaar's customer inbox (automatic answers, hand-over to the owner, alerts). */
export interface IMarketingInbox {
  receiveInstagram(message: MarketingInboxMessage): Promise<void>;
  provideInstagramReplies(replies: MarketingInstagramReplies): void;
}
