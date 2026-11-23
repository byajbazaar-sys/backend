import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Paged } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { ASYNC_FUNCTION_INVOKER, IAsyncFunctionInvoker } from '../../../shared';
import {
  defaultInboxSettings,
  InboundInboxMessage,
  InboxBotDecision,
  InboxChannelStatus,
  InboxConversation,
  InboxFaq,
  InboxMessage,
  InboxSettings,
} from '../domain';
import { EInboxChannel, EInboxConversationState, EInboxMessageAuthor, EInboxMessageStatus } from '../enums';
import { defaultHandoffNote, INBOX_HISTORY_MESSAGES } from '../utils';
import { IInboxConversationsRepository, INBOX_CONVERSATIONS_REPOSITORY } from './i-inbox-conversations.repository';
import { IInboxMessagesRepository, INBOX_MESSAGES_REPOSITORY } from './i-inbox-messages.repository';
import { IInboxSettingsRepository, INBOX_SETTINGS_REPOSITORY } from './i-inbox-settings.repository';
import { IInboxService, InboxSettingsView, InboxSummary, InboxWorkerPayload } from './i-inbox.service';
import { InboxBotService } from './inbox-bot.service';
import { INBOX_CHANNEL_REGISTRY, InboxChannelRegistry } from './inbox-channel.registry';
import { InboxKnowledgeService } from './inbox-knowledge.service';
import { InboxNotifierService } from './inbox-notifier.service';

/** After the owner's last reply, the bot stays quiet in that conversation for this long. */
const OWNER_QUIET_MS = 24 * 60 * 60 * 1000;
/** More bot replies than this in an hour (another bot, or a stuck loop) hands the conversation to the owner. */
const BOT_REPLIES_PER_HOUR = 8;
const FAQ_LIMIT = 40;

/**
 * Customer chat automation. Every customer message lands in the business's inbox; when the bot is on for the
 * channel it answers from the shop's facts or hands over to the owner, who is alerted and replies from the inbox.
 */
@Injectable()
export class InboxService implements IInboxService {
  constructor(
    @Inject(INBOX_SETTINGS_REPOSITORY) private readonly settingsRepo: IInboxSettingsRepository,
    @Inject(INBOX_CONVERSATIONS_REPOSITORY) private readonly conversations: IInboxConversationsRepository,
    @Inject(INBOX_MESSAGES_REPOSITORY) private readonly messages: IInboxMessagesRepository,
    @Inject(INBOX_CHANNEL_REGISTRY) private readonly channels: InboxChannelRegistry,
    @Inject(ASYNC_FUNCTION_INVOKER) private readonly invoker: IAsyncFunctionInvoker,
    private readonly knowledge: InboxKnowledgeService,
    private readonly bot: InboxBotService,
    private readonly notifier: InboxNotifierService,
    @InjectPinoLogger(InboxService.name) private readonly logger: PinoLogger,
  ) {}

  // ---------------------------------------------------------------- incoming (webhooks)

  async receive(input: InboundInboxMessage): Promise<void> {
    const conversation = await this.conversations.findOrCreate(
      input.userId,
      input.channel,
      input.externalUserId,
      input.customerName,
    );
    const message = await this.messages.insert({
      conversationId: conversation.id,
      userId: input.userId,
      author: EInboxMessageAuthor.Customer,
      text: input.text,
      externalMessageId: input.externalMessageId,
      status: EInboxMessageStatus.Received,
      error: null,
    });
    if (!message) return; // a webhook retry of a message already stored

    const settings = await this.settingsFor(input.userId);
    const botOn = this.botOn(settings, input.channel);
    let state = conversation.state;
    const ownerAway =
      !conversation.lastOwnerReplyAt || Date.now() - new Date(conversation.lastOwnerReplyAt).getTime() > OWNER_QUIET_MS;
    if (state === EInboxConversationState.Owner && ownerAway) state = EInboxConversationState.Auto;
    const patch: Partial<InboxConversation> = {
      lastMessageAt: input.receivedAt,
      lastInboundAt: input.receivedAt,
      lastMessagePreview: preview(input.text),
      unreadCount: (conversation.unreadCount ?? 0) + 1,
    };
    if (state === EInboxConversationState.Auto && !botOn) {
      // Automatic replies are off for this channel: the message waits for the owner (shown in the inbox only).
      state = EInboxConversationState.NeedsReply;
      patch.needsReplySince = new Date();
      patch.handoffReason = 'automatic replies are off';
    }
    patch.state = state;
    const updated = await this.conversations.update(conversation.id, patch);
    await this.notifier.changed(updated, message);
    if (state === EInboxConversationState.Auto) {
      await this.dispatch({ messageId: message.id, ...(input.isText ? {} : { nonText: true }) });
    }
  }

  /** The bot's turn for one customer message. Idempotent: a retried worker never answers twice. */
  async answer(payload: InboxWorkerPayload): Promise<void> {
    const message = await this.messages.findById(payload.messageId);
    if (message?.author !== EInboxMessageAuthor.Customer) return;
    if (!(await this.messages.claimForBot(message.id))) return;
    const conversation = await this.conversations.findById(message.conversationId);
    if (conversation?.state !== EInboxConversationState.Auto) return;
    const settings = await this.settingsFor(conversation.userId);
    if (!this.botOn(settings, conversation.channel)) return;

    const recent = await this.messages.listForConversation(conversation.id, INBOX_HISTORY_MESSAGES + 1);
    const newest = recent.find((item) => item.author === EInboxMessageAuthor.Customer);
    if (newest && newest.id !== message.id) return; // a newer message came in: its turn answers both

    const history = recent.filter((item) => item.id !== message.id).reverse();
    let decision: InboxBotDecision;
    let current = conversation;
    if (payload.nonText) {
      decision = this.handoff(settings, message, 'sent a photo, voice note or file');
    } else if (
      (await this.messages.countBotRepliesSince(conversation.id, new Date(Date.now() - 60 * 60 * 1000))) >=
      BOT_REPLIES_PER_HOUR
    ) {
      decision = this.handoff(settings, message, 'many messages in a short time');
    } else {
      const knowledge = await this.knowledge.gather(settings, conversation, message.text);
      if (knowledge.customerId && knowledge.customerId !== conversation.customerId) {
        current = await this.conversations.update(conversation.id, {
          customerId: knowledge.customerId,
          ...(conversation.customerName ? {} : { customerName: knowledge.customerName ?? null }),
        });
      }
      decision = await this.bot.decide({
        shopName: await this.knowledge.shopName(conversation.userId),
        settings,
        conversation: current,
        knowledge,
        history,
        message,
      });
    }

    const sent = await this.sendOnChannel(current, decision.reply, EInboxMessageAuthor.Bot);
    const failed = sent.status === EInboxMessageStatus.Failed;
    const handOver = decision.handoff || failed;
    const updated = await this.conversations.update(current.id, {
      lastMessageAt: new Date(),
      lastMessagePreview: preview(decision.reply),
      ...(handOver
        ? {
            state: EInboxConversationState.NeedsReply,
            needsReplySince: new Date(),
            handoffReason: failed
              ? `the reply could not be sent: ${sent.error ?? 'unknown error'}`.slice(0, 200)
              : (decision.reason ?? null),
          }
        : {}),
    });
    await this.notifier.changed(updated, sent);
    if (handOver) await this.notifier.needsReply(settings, updated, message.text);
    this.logger.info(
      { conversationId: updated.id, channel: updated.channel, handoff: handOver, reason: updated.handoffReason },
      'Inbox bot turn finished',
    );
  }

  // ---------------------------------------------------------------- owner (API)

  async listConversations(
    userId: string,
    query: { state?: EInboxConversationState; channel?: EInboxChannel; page?: number; pageSize?: number },
  ): Promise<Paged<InboxConversation>> {
    return this.conversations.list({
      userId,
      state: query.state,
      channel: query.channel,
      page: Math.max(1, query.page ?? 1),
      pageSize: Math.min(100, Math.max(1, query.pageSize ?? 30)),
    });
  }

  async getConversation(userId: string, conversationId: string): Promise<InboxConversation> {
    const conversation = await this.conversations.findForUser(conversationId, userId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async listMessages(userId: string, conversationId: string, before?: Date, limit = 50): Promise<InboxMessage[]> {
    await this.getConversation(userId, conversationId);
    const page = await this.messages.listForConversation(conversationId, Math.min(100, Math.max(1, limit)), before);
    return page.reverse();
  }

  async reply(userId: string, conversationId: string, text: string): Promise<InboxMessage> {
    const conversation = await this.getConversation(userId, conversationId);
    const body = text?.trim();
    if (!body) throw new BadRequestException('Write a reply first.');
    const sender = this.channels.get(conversation.channel);
    if (!sender) throw new ServiceUnavailableException('Replies on this channel are not available right now.');
    let externalMessageId: string | null = null;
    try {
      externalMessageId =
        (await sender.send(userId, conversation.externalUserId, body, 'owner')).externalMessageId ?? null;
    } catch (err) {
      throw new BadRequestException((err as Error)?.message || 'The reply could not be sent.');
    }
    const stored = await this.messages.insert({
      conversationId,
      userId,
      author: EInboxMessageAuthor.Owner,
      text: body,
      externalMessageId: externalMessageId ? `out:${externalMessageId}` : null,
      status: EInboxMessageStatus.Sent,
      error: null,
    });
    const now = new Date();
    const updated = await this.conversations.update(conversationId, {
      state: EInboxConversationState.Owner,
      lastOwnerReplyAt: now,
      lastMessageAt: now,
      lastMessagePreview: preview(body),
      needsReplySince: null,
      handoffReason: null,
      unreadCount: 0,
    });
    await this.notifier.changed(updated, stored ?? undefined);
    return stored;
  }

  async setState(
    userId: string,
    conversationId: string,
    state: EInboxConversationState.Auto | EInboxConversationState.NeedsReply,
  ): Promise<InboxConversation> {
    await this.getConversation(userId, conversationId);
    const updated = await this.conversations.update(conversationId, {
      state,
      ...(state === EInboxConversationState.Auto
        ? { needsReplySince: null, handoffReason: null, lastOwnerReplyAt: null }
        : { needsReplySince: new Date(), handoffReason: 'kept for the owner' }),
    });
    await this.notifier.changed(updated);
    return updated;
  }

  async markRead(userId: string, conversationId: string): Promise<InboxConversation> {
    await this.getConversation(userId, conversationId);
    const updated = await this.conversations.update(conversationId, { unreadCount: 0 });
    await this.notifier.changed(updated);
    return updated;
  }

  async summary(userId: string): Promise<InboxSummary> {
    const [needsReply, unread] = await Promise.all([
      this.conversations.countNeedingReply(userId),
      this.conversations.countUnread(userId),
    ]);
    return { needsReply, unread };
  }

  // ---------------------------------------------------------------- settings

  async getSettings(userId: string): Promise<InboxSettingsView> {
    const settings = await this.settingsFor(userId);
    return { settings, channels: await this.channelStatuses(userId) };
  }

  async updateSettings(userId: string, patch: Partial<InboxSettings>): Promise<InboxSettingsView> {
    const current = await this.settingsFor(userId);
    const next: InboxSettings = {
      ...current,
      ...pickBooleans(patch),
      businessHours: text(patch.businessHours, current.businessHours, 300),
      about: text(patch.about, current.about, 4000),
      instructions: text(patch.instructions, current.instructions, 1500),
      handoffMessage: text(patch.handoffMessage, current.handoffMessage, 500),
      faqs: patch.faqs === undefined ? current.faqs : cleanFaqs(patch.faqs),
      userId,
    };
    const saved = await this.settingsRepo.save(next);
    // Switching a channel on sets it up where needed (Instagram: subscribe the account to message webhooks).
    const statuses: Partial<Record<EInboxChannel, InboxChannelStatus>> = {};
    for (const channel of [EInboxChannel.WhatsApp, EInboxChannel.Instagram]) {
      if (this.botOn(saved, channel) && !this.botOn(current, channel)) {
        const sender = this.channels.get(channel);
        if (sender?.prepare) {
          statuses[channel] = await sender.prepare(userId).catch((err) => ({
            connected: true,
            ready: false,
            reason: (err as Error)?.message || 'Setting up failed',
          }));
        }
      }
    }
    return { settings: saved, channels: { ...(await this.channelStatuses(userId)), ...statuses } };
  }

  // ---------------------------------------------------------------- helpers

  private async settingsFor(userId: string): Promise<InboxSettings> {
    return (await this.settingsRepo.find(userId)) ?? defaultInboxSettings(userId);
  }

  private botOn(settings: InboxSettings, channel: EInboxChannel): boolean {
    return channel === EInboxChannel.WhatsApp ? settings.whatsappEnabled : settings.instagramEnabled;
  }

  private handoff(settings: InboxSettings, message: InboxMessage, reason: string): InboxBotDecision {
    return { handoff: true, reason, reply: settings.handoffMessage?.trim() || defaultHandoffNote(message.text) };
  }

  /** A bot reply goes out and is stored either way; a failed one keeps the channel's error for the owner. */
  private async sendOnChannel(
    conversation: InboxConversation,
    text: string,
    author: EInboxMessageAuthor,
  ): Promise<InboxMessage> {
    const sender = this.channels.get(conversation.channel);
    let status = EInboxMessageStatus.Sent;
    let error: string | null = null;
    let externalMessageId: string | null = null;
    try {
      if (!sender) throw new Error(`${conversation.channel} replies are not available`);
      const result = await sender.send(conversation.userId, conversation.externalUserId, text, 'bot');
      externalMessageId = result.externalMessageId ?? null;
    } catch (err) {
      status = EInboxMessageStatus.Failed;
      error = ((err as Error)?.message || 'send failed').slice(0, 500);
      this.logger.warn(
        { conversationId: conversation.id, channel: conversation.channel, error },
        'Inbox bot reply failed',
      );
    }
    const stored = await this.messages.insert({
      conversationId: conversation.id,
      userId: conversation.userId,
      author,
      text,
      externalMessageId: externalMessageId ? `out:${externalMessageId}` : null,
      status,
      error,
    });
    return stored;
  }

  private async channelStatuses(userId: string): Promise<Record<EInboxChannel, InboxChannelStatus>> {
    const status = async (channel: EInboxChannel): Promise<InboxChannelStatus> => {
      const sender = this.channels.get(channel);
      if (!sender) return { connected: false, ready: false, reason: 'Not available' };
      return sender.status(userId).catch((err) => ({
        connected: false,
        ready: false,
        reason: (err as Error)?.message || 'Could not check the connection',
      }));
    };
    const [whatsapp, instagram] = await Promise.all([status(EInboxChannel.WhatsApp), status(EInboxChannel.Instagram)]);
    return { [EInboxChannel.WhatsApp]: whatsapp, [EInboxChannel.Instagram]: instagram };
  }

  /** The bot's turn runs in the inbox worker Lambda (Meta wants the webhook acknowledged at once); inline locally. */
  private async dispatch(payload: InboxWorkerPayload): Promise<void> {
    const functionName =
      process.env.INBOX_WORKER_LAMBDA_NAME?.trim() ||
      process.env.AWS_LAMBDA_FUNCTION_NAME?.replace(/-[A-Za-z0-9]+$/, '-inboxWorker');
    if (functionName && process.env.INBOX_INLINE !== 'true') {
      try {
        await this.invoker.invoke(functionName, payload);
        return;
      } catch (err) {
        this.logger.warn(
          { err: (err as Error)?.message, functionName },
          'Inbox worker invoke failed — answering inline',
        );
      }
    }
    void this.answer(payload).catch((err) =>
      this.logger.error({ err: (err as Error)?.message, messageId: payload.messageId }, 'Inline inbox answer failed'),
    );
  }
}

function preview(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function text(value: string | null | undefined, current: string | null, max: number): string | null {
  if (value === undefined) return current;
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function cleanFaqs(faqs: InboxFaq[] | null): InboxFaq[] {
  return (faqs ?? [])
    .map((faq) => ({
      question: (faq?.question ?? '').trim().slice(0, 300),
      answer: (faq?.answer ?? '').trim().slice(0, 1000),
    }))
    .filter((faq) => faq.question && faq.answer)
    .slice(0, FAQ_LIMIT);
}

const BOOLEAN_FIELDS = [
  'whatsappEnabled',
  'instagramEnabled',
  'answerShopInfo',
  'answerRates',
  'answerCatalogue',
  'answerAccount',
  'notifyEmail',
  'notifyPush',
] as const;

function pickBooleans(patch: Partial<InboxSettings>): Partial<InboxSettings> {
  const out: Partial<InboxSettings> = {};
  for (const key of BOOLEAN_FIELDS) {
    if (typeof patch[key] === 'boolean') out[key] = patch[key];
  }
  return out;
}
