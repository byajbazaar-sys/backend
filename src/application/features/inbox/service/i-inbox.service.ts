import { Paged } from '@shared-libs';

import { InboundInboxMessage, InboxConversation, InboxMessage, InboxSettings } from '../domain';
import { InboxChannelStatus } from '../domain/inbox-channel-sender';
import { EInboxChannel, EInboxConversationState } from '../enums';

export const INBOX_SERVICE = 'INBOX_SERVICE';

export interface InboxSummary {
  needsReply: number;
  unread: number;
}

export interface InboxSettingsView {
  settings: InboxSettings;
  channels: Record<EInboxChannel, InboxChannelStatus>;
}

/** Payload of the inbox worker Lambda (one customer message to answer). */
export interface InboxWorkerPayload {
  messageId: string;
  /** A photo, voice note or file: the bot cannot read it and hands it to the owner. */
  nonText?: boolean;
}

export interface IInboxService {
  /** A customer message from a channel webhook: stored, then answered by the bot or handed to the owner. */
  receive(input: InboundInboxMessage): Promise<void>;
  /** The bot's turn for one stored customer message (inbox worker Lambda, or inline in local dev). */
  answer(payload: InboxWorkerPayload): Promise<void>;

  listConversations(
    userId: string,
    query: { state?: EInboxConversationState; channel?: EInboxChannel; page?: number; pageSize?: number },
  ): Promise<Paged<InboxConversation>>;
  getConversation(userId: string, conversationId: string): Promise<InboxConversation>;
  listMessages(userId: string, conversationId: string, before?: Date, limit?: number): Promise<InboxMessage[]>;
  /** The owner's reply: sent on the conversation's channel; the bot stays quiet in it until handed back. */
  reply(userId: string, conversationId: string, text: string): Promise<InboxMessage>;
  /** Auto = hand the conversation back to the bot; NeedsReply = keep it for the owner. */
  setState(
    userId: string,
    conversationId: string,
    state: EInboxConversationState.Auto | EInboxConversationState.NeedsReply,
  ): Promise<InboxConversation>;
  markRead(userId: string, conversationId: string): Promise<InboxConversation>;
  summary(userId: string): Promise<InboxSummary>;

  getSettings(userId: string): Promise<InboxSettingsView>;
  updateSettings(userId: string, patch: Partial<InboxSettings>): Promise<InboxSettingsView>;
}
