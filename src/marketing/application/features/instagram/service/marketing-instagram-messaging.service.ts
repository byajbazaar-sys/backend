import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  IInstagramGraphClient,
  IMarketingInbox,
  IMarketingInstagramRepository,
  IMarketingSecretCipher,
  INSTAGRAM_GRAPH_CLIENT,
  MARKETING_INBOX,
  MARKETING_INSTAGRAM_REPOSITORY,
  MARKETING_SECRET_CIPHER,
  MarketingInboxStatus,
  MarketingInstagramConnection,
  MarketingInstagramReplies,
} from '../../../shared';

/** Instagram takes at most 1,000 bytes of text per message. */
const INSTAGRAM_TEXT_BYTES = 1000;
const NAME_CACHE_LIMIT = 500;

const ATTACHMENT_LABELS: Record<string, string> = {
  image: '📷 Photo',
  video: '🎬 Video',
  audio: '🎤 Voice message',
  file: '📄 File',
  share: '🔗 Shared post',
  story_mention: '📣 Mentioned you in a story',
  reel: '🎬 Shared reel',
  ig_reel: '🎬 Shared reel',
};

/**
 * Instagram DMs for the customer inbox: customer messages arrive on the Instagram webhook, replies go out through
 * the Facebook Page linked to the Instagram account (Meta's Instagram Messaging; needs instagram_manage_messages and
 * pages_manage_metadata on the login configuration). The Page is looked up when the owner switches Instagram
 * replies on.
 */
@Injectable()
export class MarketingInstagramMessagingService implements MarketingInstagramReplies, OnModuleInit {
  private readonly names = new Map<string, string | null>();

  constructor(
    @Inject(MARKETING_SECRET_CIPHER) private readonly cipher: IMarketingSecretCipher,
    @Inject(INSTAGRAM_GRAPH_CLIENT) private readonly instagram: IInstagramGraphClient,
    @Inject(MARKETING_INSTAGRAM_REPOSITORY) private readonly connections: IMarketingInstagramRepository,
    @Inject(MARKETING_INBOX) private readonly inbox: IMarketingInbox,
    @InjectPinoLogger(MarketingInstagramMessagingService.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.inbox.provideInstagramReplies(this);
  }

  // ---------------------------------------------------------------- inbox channel

  async status(userId: string): Promise<MarketingInboxStatus> {
    const connection = await this.connections.findConnection(userId);
    if (!connection) return { connected: false, ready: false, reason: 'Connect Instagram in Marketing first.' };
    if (isExpired(connection.tokenExpiresAt)) {
      return { connected: true, ready: false, reason: 'Reconnect Instagram in Marketing (the login expired).' };
    }
    if (!connection.messagingPageId || !connection.messagingTokenEncrypted) {
      return {
        connected: true,
        ready: false,
        reason:
          'Switch on Instagram replies to link the Facebook Page of @' +
          `${connection.username} (the account must be linked to a Facebook Page, with message access allowed).`,
      };
    }
    return { connected: true, ready: true };
  }

  async prepare(userId: string): Promise<MarketingInboxStatus> {
    const connection = await this.connections.findConnection(userId);
    if (!connection) return { connected: false, ready: false, reason: 'Connect Instagram in Marketing first.' };
    const page = await this.instagram.findMessagingPage(
      this.cipher.decrypt(connection.accessTokenEncrypted),
      connection.instagramUserId,
    );
    if (!page) {
      await this.connections.saveMessaging(userId, null, null);
      return {
        connected: true,
        ready: false,
        reason:
          `No Facebook Page linked to @${connection.username} was found. Link the Instagram account to a Facebook ` +
          'Page, then reconnect Instagram in Marketing and allow access to messages.',
      };
    }
    await this.instagram.subscribeMessaging(page.pageId, page.pageToken);
    await this.connections.saveMessaging(userId, page.pageId, this.cipher.encrypt(page.pageToken));
    this.logger.info({ userId, pageId: page.pageId }, 'Instagram messaging linked for the customer inbox');
    return { connected: true, ready: true };
  }

  async send(
    userId: string,
    recipientId: string,
    text: string,
    by: 'bot' | 'owner',
  ): Promise<{ messageId: string | null }> {
    const pageToken = await this.pageToken(userId);
    const body = clipBytes(text, INSTAGRAM_TEXT_BYTES);
    try {
      return { messageId: await this.instagram.sendDirectMessage(pageToken, recipientId, body) };
    } catch (err) {
      // An owner's reply after Instagram's 24 hours goes out with the human-agent tag (up to 7 days).
      if (by === 'owner' && outsideWindow(err)) {
        return { messageId: await this.instagram.sendDirectMessage(pageToken, recipientId, body, true) };
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------- webhook

  /** Customer DMs from the Instagram webhook into the inbox; anything else (echoes, reads, reactions) is ignored. */
  async handleWebhook(payload: unknown): Promise<void> {
    const body = asRecord(payload);
    if (body.object !== 'instagram') return;
    const accounts = new Map<string, MarketingInstagramConnection | null>();
    for (const rawEntry of asArray(body.entry)) {
      const entry = asRecord(rawEntry);
      const instagramUserId = asString(entry.id);
      if (!instagramUserId) continue;
      if (!accounts.has(instagramUserId)) {
        accounts.set(instagramUserId, await this.connections.findByInstagramUserId(instagramUserId));
      }
      const connection = accounts.get(instagramUserId);
      if (!connection) continue;
      for (const rawEvent of asArray(entry.messaging)) {
        await this.receiveEvent(connection, asRecord(rawEvent)).catch((err) =>
          this.logger.error({ err, userId: connection.userId }, 'Instagram message could not reach the inbox'),
        );
      }
    }
  }

  private async receiveEvent(connection: MarketingInstagramConnection, event: Record<string, unknown>): Promise<void> {
    const message = asRecord(event.message);
    const senderId = asString(asRecord(event.sender).id);
    const mid = asString(message.mid);
    if (!mid || !senderId || senderId === connection.instagramUserId) return;
    if (message.is_echo === true || message.is_deleted === true) return;
    const text = asString(message.text)?.trim();
    const attachment = asRecord(asArray(message.attachments)[0]);
    const content = text
      ? { text, isText: true }
      : Object.keys(attachment).length
        ? { text: ATTACHMENT_LABELS[asString(attachment.type) ?? ''] ?? '📎 Attachment', isText: false }
        : null;
    if (!content) return;
    const timestamp = Number(event.timestamp);
    await this.inbox.receiveInstagram({
      userId: connection.userId,
      customerId: senderId,
      customerName: await this.customerName(connection, senderId),
      text: content.text,
      isText: content.isText,
      messageId: mid,
      receivedAt: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : new Date(),
    });
  }

  /** "@username" (or the name) of a customer, cached for the Lambda's lifetime. */
  private async customerName(connection: MarketingInstagramConnection, senderId: string): Promise<string | null> {
    if (this.names.has(senderId)) return this.names.get(senderId) ?? null;
    let name: string | null = null;
    if (connection.messagingTokenEncrypted) {
      const profile = await this.instagram.getMessagingProfile(
        this.cipher.decrypt(connection.messagingTokenEncrypted),
        senderId,
      );
      name = profile?.username ? `@${profile.username}` : (profile?.name ?? null);
    }
    if (this.names.size >= NAME_CACHE_LIMIT) this.names.delete(this.names.keys().next().value as string);
    this.names.set(senderId, name);
    return name;
  }

  /** The linked Page's token; linked now when the owner switched replies on before the Page could be found. */
  private async pageToken(userId: string): Promise<string> {
    let connection = await this.connections.findConnection(userId);
    if (connection && !connection.messagingTokenEncrypted) {
      const status = await this.prepare(userId);
      if (!status.ready) throw new Error(status.reason ?? 'Instagram messaging is not linked');
      connection = await this.connections.findConnection(userId);
    }
    if (!connection?.messagingTokenEncrypted) throw new Error('Instagram is not connected for this business');
    return this.cipher.decrypt(connection.messagingTokenEncrypted);
  }
}

function outsideWindow(err: unknown): boolean {
  const { code, subcode, message } = (err ?? {}) as { code?: number; subcode?: number; message?: string };
  return subcode === 2018278 || subcode === 2534022 || (code === 10 && /window/i.test(message ?? ''));
}

function clipBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  let out = '';
  for (const char of text) {
    if (Buffer.byteLength(out + char, 'utf8') > maxBytes - 3) break;
    out += char;
  }
  return `${out.trimEnd()}…`;
}

function isExpired(expiresAt: Date | null): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : typeof value === 'number' ? String(value) : undefined;
}
