import { Inject, Injectable } from '@nestjs/common';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  EMAIL_SERVICE,
  IEmailService,
  IWebSocketMessageService,
  SendEmail,
  WEBSOCKET_MESSAGE_SERVICE,
} from '../../../shared';
import {
  IPushNotificationService,
  PUSH_NOTIFICATION_SERVICE,
} from '../../notifications/service/i-push-notification.service';
import {
  IWebSocketConnectionsRepository,
  WEBSOCKET_CONNECTIONS_REPOSITORY,
} from '../../pos/service/i-websocket-connections.repository';
import { ShopAccessService } from '../../shops/service/shop-access.service';
import { IUsersRepository, USERS_REPOSITORY } from '../../users/service/i-users.repository';
import { InboxConversation, InboxMessage, InboxSettings } from '../domain';
import { EInboxChannel } from '../enums';

const CHANNEL_NAMES: Record<EInboxChannel, string> = {
  [EInboxChannel.WhatsApp]: 'WhatsApp',
  [EInboxChannel.Instagram]: 'Instagram',
};

/** Tells the business owner about the inbox: live in the open app, and by email and push when a reply is needed. */
@Injectable()
export class InboxNotifierService {
  constructor(
    @Inject(WEBSOCKET_CONNECTIONS_REPOSITORY) private readonly connections: IWebSocketConnectionsRepository,
    @Inject(WEBSOCKET_MESSAGE_SERVICE) private readonly ws: IWebSocketMessageService,
    @Inject(EMAIL_SERVICE) private readonly email: IEmailService,
    @Inject(PUSH_NOTIFICATION_SERVICE) private readonly push: IPushNotificationService,
    @Inject(USERS_REPOSITORY) private readonly users: IUsersRepository,
    private readonly shopAccess: ShopAccessService,
    @InjectPinoLogger(InboxNotifierService.name) private readonly logger: PinoLogger,
  ) {}

  /** Live update for the owner's open web / mobile app (list, badge and open conversation). */
  async changed(conversation: InboxConversation, message?: InboxMessage): Promise<void> {
    if (!process.env.WEBSOCKET_API_ENDPOINT) return;
    try {
      const sockets = await this.connections.findActiveByUserId(conversation.userId, 'whatsapp');
      const payload = {
        type: 'inboxUpdated',
        conversation: instanceToPlain(
          plainToInstance(InboxConversation, conversation, { excludeExtraneousValues: true }),
        ),
        ...(message
          ? { message: instanceToPlain(plainToInstance(InboxMessage, message, { excludeExtraneousValues: true })) }
          : {}),
        timestamp: new Date().toISOString(),
      };
      await Promise.all(
        sockets.map(async (socket) => {
          const delivered = await this.ws.sendToConnection(socket.connectionId, payload).catch(() => false);
          if (!delivered) await this.connections.markDisconnected(socket.connectionId).catch(() => undefined);
        }),
      );
    } catch (err) {
      this.logger.warn({ err: (err as Error)?.message, userId: conversation.userId }, 'Inbox live update failed');
    }
  }

  /**
   * A customer waits for a reply: email and push (each as the owner chose), once per hand-over. Phones and inboxes
   * belong to people, not to the shop account: push goes to the owner and every member who handles WhatsApp; the email
   * goes to the owner (an extra shop's own address is a placeholder nobody reads).
   */
  async needsReply(settings: InboxSettings, conversation: InboxConversation, question: string): Promise<void> {
    const who = conversation.customerName?.trim() || this.maskedId(conversation);
    const channel = CHANNEL_NAMES[conversation.channel];
    const link = this.inboxLink(conversation.id);
    const people = await this.shopAccess
      .peopleFor(conversation.userId, 'whatsapp')
      .catch(() => ({ ownerUserId: conversation.userId, memberUserIds: [] as string[] }));
    const jobs: Promise<unknown>[] = [];
    if (settings.notifyPush) {
      const recipients = new Set([people.ownerUserId ?? conversation.userId, ...people.memberUserIds]);
      for (const personId of recipients) {
        jobs.push(
          this.push.sendToUser(personId, {
            title: `${who} needs a reply on ${channel}`,
            body: question.slice(0, 200),
            // shopId: the shop the conversation belongs to (the app switches to it before opening the conversation).
            data: { type: 'inbox', conversationId: conversation.id, shopId: conversation.userId },
          }),
        );
      }
    }
    if (settings.notifyEmail) {
      jobs.push(this.sendEmail(conversation, people.ownerUserId ?? conversation.userId, who, channel, question, link));
    }
    await Promise.all(jobs.map((job) => job.catch(() => undefined)));
  }

  private async sendEmail(
    conversation: InboxConversation,
    recipientUserId: string,
    who: string,
    channel: string,
    question: string,
    link: string | null,
  ): Promise<void> {
    const [user, shop] = await Promise.all([
      this.users.findById(recipientUserId).catch(() => null),
      recipientUserId === conversation.userId
        ? Promise.resolve(null)
        : this.users.findById(conversation.userId).catch(() => null),
    ]);
    if (!user?.email || user.ownerUserId) return;
    const shopName = (shop ?? user).businessName;
    const reason = conversation.handoffReason
      ? `<p style="color:#555">Why: ${escapeHtml(conversation.handoffReason)}</p>`
      : '';
    const body =
      `<p>${escapeHtml(who)} wrote to ${escapeHtml(String(shopName || 'your shop'))} on ${channel}, and the ` +
      'automatic assistant handed the conversation to you:</p>' +
      `<blockquote style="border-left:3px solid #ffad33;margin:12px 0;padding:6px 12px">${escapeHtml(question)}</blockquote>` +
      reason +
      (link
        ? `<p><a href="${link}">Open the conversation and reply</a></p>`
        : '<p>Reply from the Inbox in the ByajBazaar app.</p>');
    try {
      await this.email.sendEmail(
        plainToInstance(SendEmail, {
          to: user.email,
          subject: `${who} needs a reply on ${channel}`,
          body,
          isHtml: true,
        }),
      );
    } catch (err) {
      this.logger.warn({ err: (err as Error)?.message, userId: conversation.userId }, 'Inbox email failed');
    }
  }

  private inboxLink(conversationId: string): string | null {
    const web = (process.env.WEB_APP_DOMAIN ?? '').replace(/\/$/, '');
    return web ? `${web}/inbox?c=${conversationId}` : null;
  }

  private maskedId(conversation: InboxConversation): string {
    if (conversation.channel === EInboxChannel.WhatsApp) return `+${conversation.externalUserId}`;
    return 'An Instagram customer';
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
}
