import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { toActionView } from './ai-action-view';
import { AiConfig } from '../../ai.config';
import {
  AiActionView,
  AiActor,
  AiChatResponse,
  AiConversation,
  AiConversationSummaryView,
  AiConversationTurnView,
  AiConversationView,
  AiUsageTotals,
  EAiAuditEvent,
  EAiIntent,
} from '../domain';
import {
  AI_ACTIONS_REPOSITORY,
  AI_AUDIT_LOG,
  AI_CONVERSATIONS_REPOSITORY,
  AI_MESSAGES_REPOSITORY,
  AI_USAGE_REPOSITORY,
  IAiActionsRepository,
  IAiAuditLog,
  IAiConversationsRepository,
  IAiMessagesRepository,
  IAiUsageRepository,
} from '../ports';

/** Shown turns of a conversation (the most recent ones). */
const MAX_TURNS_SHOWN = 50;

/** A person's own conversations in the current shop: list, read, delete; and their usage. */
@Injectable()
export class AiConversationsService {
  constructor(
    private readonly config: AiConfig,
    @Inject(AI_CONVERSATIONS_REPOSITORY) private readonly conversations: IAiConversationsRepository,
    @Inject(AI_MESSAGES_REPOSITORY) private readonly messages: IAiMessagesRepository,
    @Inject(AI_ACTIONS_REPOSITORY) private readonly actions: IAiActionsRepository,
    @Inject(AI_AUDIT_LOG) private readonly audit: IAiAuditLog,
    @Inject(AI_USAGE_REPOSITORY) private readonly usage: IAiUsageRepository,
  ) {}

  async list(actor: AiActor, limit = 20, before?: Date): Promise<AiConversationSummaryView[]> {
    const rows = await this.conversations.listForActor(
      actor.shopId,
      actor.actorUserId,
      Math.min(Math.max(limit, 1), 50),
      before,
    );
    return rows.map(summaryView);
  }

  async get(actor: AiActor, id: string): Promise<AiConversationView> {
    const conversation = await this.require(actor, id);
    const from = Math.max(1, conversation.turnCount - MAX_TURNS_SHOWN + 1);
    const messages = await this.messages.listTurns(id, from, conversation.turnCount);
    const turns = new Map<number, AiConversationTurnView>();
    const actionIds = new Set<string>();

    for (const message of messages) {
      let turn = turns.get(message.turnIndex);
      if (message.role === 'user' && message.seq === 0) {
        const text = message.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as { text: string }).text)
          .join('\n');
        turn = {
          turnIndex: message.turnIndex,
          user: { text, createdAt: message.createdAt.toISOString() },
          assistant: null,
          events: [],
        };
        turns.set(message.turnIndex, turn);
      }
      if (!turn) continue;
      if (message.role === 'event') {
        const text = message.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as { text: string }).text)
          .join('\n');
        turn.events.push({ text: eventLabel(text), createdAt: message.createdAt.toISOString() });
      }
      const response = message.response as AiChatResponse | null | undefined;
      if (response?.message) {
        turn.assistant = {
          text: response.message.text,
          intent: response.intent ?? EAiIntent.Unknown,
          cards: response.cards ?? [],
          actions: response.actions ?? [],
        };
        for (const action of response.actions ?? []) actionIds.add(action.id);
      }
    }

    // Previews may have been confirmed or cancelled since: show their current state.
    if (actionIds.size) {
      const latest = new Map((await this.actions.findByIds([...actionIds])).map((a) => [a.id, toActionView(a)]));
      for (const turn of turns.values()) {
        if (turn.assistant)
          turn.assistant.actions = turn.assistant.actions.map((a: AiActionView) => latest.get(a.id) ?? a);
      }
    }
    return { ...summaryView(conversation), turns: [...turns.values()].sort((a, b) => a.turnIndex - b.turnIndex) };
  }

  async delete(actor: AiActor, id: string): Promise<void> {
    await this.require(actor, id);
    await this.actions.cancelOpenForConversation(id);
    await this.conversations.delete(id);
    await this.audit.record({
      event: EAiAuditEvent.ConversationDeleted,
      shopId: actor.shopId,
      actorUserId: actor.actorUserId,
      conversationId: id,
    });
  }

  async usageFor(actor: AiActor): Promise<{
    today: AiUsageTotals;
    month: AiUsageTotals;
    shopMonth: AiUsageTotals | null;
    limits: { dailyMessages: number; remainingToday: number };
  }> {
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [today, thisMonth, usedToday] = await Promise.all([
      this.usage.totals({ shopId: actor.shopId, actorUserId: actor.actorUserId, since: day }),
      this.usage.totals({ shopId: actor.shopId, actorUserId: actor.actorUserId, since: month }),
      this.usage.countTurnsSince(actor.actorUserId, day),
    ]);
    // The whole shop's usage is the owner's business only.
    const shopMonth =
      actor.shopRole === 'owner' ? await this.usage.totals({ shopId: actor.shopId, since: month }) : null;
    const dailyMessages = this.config.limits.dailyMessages;
    return {
      today,
      month: thisMonth,
      shopMonth,
      limits: { dailyMessages, remainingToday: Math.max(0, dailyMessages - usedToday) },
    };
  }

  private async require(actor: AiActor, id: string): Promise<AiConversation> {
    const conversation = await this.conversations.findForActor(id, actor.shopId, actor.actorUserId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }
}

const summaryView = (c: AiConversation): AiConversationSummaryView => ({
  id: c.id,
  title: c.title,
  turnCount: c.turnCount,
  lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
  createdAt: c.createdAt.toISOString(),
});

/** "The person confirmed inventory.create (action …). Done: Saved …" → "Saved …" for the person. */
function eventLabel(text: string): string {
  const done = /Done: (.*)$/s.exec(text);
  if (done) return done[1];
  if (text.includes('cancelled')) return 'Cancelled — nothing was saved.';
  const failed = /but it failed: (.*)$/s.exec(text);
  return failed ? `Failed: ${failed[1]}` : text;
}
