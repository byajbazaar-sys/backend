import { EInboxChannel } from '../enums';

/** Whether a channel can carry the bot's and the owner's replies for a business right now. */
export interface InboxChannelStatus {
  connected: boolean;
  /** Connected and allowed to send replies. */
  ready: boolean;
  /** What the owner should do when it is not ready. */
  reason?: string;
}

/** Sends replies on one channel; WhatsApp lives in the app, Instagram in the marketing module (it holds the token). */
export interface IInboxChannelSender {
  readonly channel: EInboxChannel;
  /** `by` = owner may use a channel's human-agent window (a reply after the normal 24 hours). */
  send(
    userId: string,
    externalUserId: string,
    text: string,
    by: 'bot' | 'owner',
  ): Promise<{ externalMessageId?: string | null }>;
  status(userId: string): Promise<InboxChannelStatus>;
  /** Called when the owner switches the bot on for this channel (e.g. subscribe the account to message webhooks). */
  prepare?(userId: string): Promise<InboxChannelStatus>;
}
