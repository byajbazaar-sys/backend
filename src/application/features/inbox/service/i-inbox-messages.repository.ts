import { InboxMessage } from '../domain';

export const INBOX_MESSAGES_REPOSITORY = 'INBOX_MESSAGES_REPOSITORY';

export interface IInboxMessagesRepository {
  /** Stores a message; for customer messages, null when that channel message was stored already (webhook retry). */
  insert(message: Omit<InboxMessage, 'id' | 'createdAt' | 'botHandledAt'>): Promise<InboxMessage | null>;
  findById(id: string): Promise<InboxMessage | null>;
  update(id: string, patch: Partial<InboxMessage>): Promise<void>;
  /** Newest first, at most `limit`, older than `before` when given. */
  listForConversation(conversationId: string, limit: number, before?: Date): Promise<InboxMessage[]>;
  countBotRepliesSince(conversationId: string, since: Date): Promise<number>;
  /** Marks a customer message as taken by the bot; false when another worker already took it. */
  claimForBot(id: string): Promise<boolean>;
}
