export enum EInboxMessageStatus {
  /** A customer message we stored. */
  Received = 'received',
  /** A bot or owner reply the channel accepted. */
  Sent = 'sent',
  /** A bot or owner reply the channel refused (see the message's error). */
  Failed = 'failed',
}
