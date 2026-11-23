import { EInboxChannel } from '../enums';

/** A customer message from a channel webhook. */
export interface InboundInboxMessage {
  userId: string;
  channel: EInboxChannel;
  externalUserId: string;
  customerName?: string | null;
  /** The text, or a short placeholder for a photo, voice note or other attachment. */
  text: string;
  /** False for photos, voice notes and other attachments the bot cannot read. */
  isText: boolean;
  externalMessageId: string;
  receivedAt: Date;
}
