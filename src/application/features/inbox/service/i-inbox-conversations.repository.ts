import { Paged } from '@shared-libs';

import { InboxConversation } from '../domain';
import { EInboxChannel, EInboxConversationState } from '../enums';

export const INBOX_CONVERSATIONS_REPOSITORY = 'INBOX_CONVERSATIONS_REPOSITORY';

export interface InboxConversationsFilter {
  userId: string;
  state?: EInboxConversationState;
  channel?: EInboxChannel;
  page: number;
  pageSize: number;
}

export interface IInboxConversationsRepository {
  /** The conversation of this customer on this channel, created on their first message. */
  findOrCreate(
    userId: string,
    channel: EInboxChannel,
    externalUserId: string,
    customerName?: string | null,
  ): Promise<InboxConversation>;
  findById(id: string): Promise<InboxConversation | null>;
  findForUser(id: string, userId: string): Promise<InboxConversation | null>;
  update(id: string, patch: Partial<InboxConversation>): Promise<InboxConversation>;
  list(filter: InboxConversationsFilter): Promise<Paged<InboxConversation>>;
  countNeedingReply(userId: string): Promise<number>;
  countUnread(userId: string): Promise<number>;
}
