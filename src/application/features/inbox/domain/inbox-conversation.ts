import { Expose } from 'class-transformer';

import { EInboxChannel, EInboxConversationState } from '../enums';

/** One customer on one channel of one business. */
export class InboxConversation {
  @Expose()
  id: string;

  @Expose()
  userId: string;

  @Expose()
  channel: EInboxChannel;

  /** WhatsApp: the customer's number (digits, with country code). Instagram: the Instagram-scoped user ID. */
  @Expose()
  externalUserId: string;

  @Expose()
  customerName: string | null;

  /** The shop's customer record this conversation was matched to (WhatsApp number), if any. */
  @Expose()
  customerId: string | null;

  @Expose()
  state: EInboxConversationState;

  @Expose()
  unreadCount: number;

  @Expose()
  lastMessageAt: Date | null;

  @Expose()
  lastInboundAt: Date | null;

  @Expose()
  lastMessagePreview: string | null;

  @Expose()
  needsReplySince: Date | null;

  /** Why the bot handed over (a few words), shown to the owner. */
  @Expose()
  handoffReason: string | null;

  @Expose()
  lastOwnerReplyAt: Date | null;

  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;
}
