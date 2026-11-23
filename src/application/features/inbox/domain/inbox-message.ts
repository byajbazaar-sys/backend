import { Expose } from 'class-transformer';

import { EInboxMessageAuthor, EInboxMessageStatus } from '../enums';

export class InboxMessage {
  @Expose()
  id: string;

  @Expose()
  conversationId: string;

  @Expose()
  userId: string;

  @Expose()
  author: EInboxMessageAuthor;

  @Expose()
  text: string;

  /** The channel's own message ID (dedupes webhook retries for customer messages). */
  @Expose()
  externalMessageId: string | null;

  @Expose()
  status: EInboxMessageStatus;

  @Expose()
  error: string | null;

  /** A customer message the bot has already taken (so a retried worker never answers twice). */
  @Expose()
  botHandledAt: Date | null;

  @Expose()
  createdAt?: Date;
}
