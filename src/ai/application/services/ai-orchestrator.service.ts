import {
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { toActionView } from './ai-action-view';
import { buildModelHistory, modelToStoredBlocks, storedToModelBlocks, textOf } from './ai-history';
import { AI_SYSTEM_PROMPT } from './ai-prompts';
import { AiConfig } from '../../ai.config';
import {
  actionPayloadHash,
  actorCan,
  AiActor,
  AiBusinessError,
  AiCard,
  AiChatResponse,
  AiConversation,
  AiModelError,
  AiPendingAction,
  AiPreferences,
  AiStoredBlock,
  DEFAULT_AI_PREFERENCES,
  EAiActionStatus,
  EAiAuditEvent,
  EAiIntent,
} from '../domain';
import {
  AI_ACTIONS_REPOSITORY,
  AI_AUDIT_LOG,
  AI_CONVERSATIONS_REPOSITORY,
  AI_LANGUAGE_MODEL,
  AI_MESSAGES_REPOSITORY,
  AI_PREFERENCES_REPOSITORY,
  AI_PROGRESS_NOTIFIER,
  AI_QUEUE,
  AI_USAGE_REPOSITORY,
  AiGenerateResult,
  AiModelBlock,
  AiModelMessage,
  IAiActionsRepository,
  IAiAuditLog,
  IAiConversationsRepository,
  IAiLanguageModel,
  IAiMessagesRepository,
  IAiPreferencesRepository,
  IAiProgressNotifier,
  IAiQueue,
  IAiUsageRepository,
} from '../ports';
import { AiTool, AiToolContext, AiToolOutcome, AiToolRegistry, isWriteTool, parseToolInput } from '../tools';

export interface AiChatInput {
  message: string;
  conversationId?: string;
  /** Client-generated id for this message: a retry with the same id returns the first answer (nothing runs twice). */
  clientMessageId?: string;
  /** The screen the person is on (e.g. /inventory), for context-aware answers. */
  page?: string;
  /**
   * Set when the message was spoken (the voice gateway transcribed it): the original transcript is stored with the
   * message for audit, and the model is told it may contain recognition mistakes. `message` is the cleaned-up text.
   */
  voice?: AiVoiceTurnContext;
}

export interface AiVoiceTurnContext {
  original: string;
  language: string | null;
  confidence: number | null;
  /** From the transcript normaliser, e.g. unit:aana, fraction, amount. */
  flags: string[];
  /** Previews of these actions can be confirmed by saying "confirm" (the rest need a tap). */
  confirmableByVoice: string[];
}

type ToolCall = Extract<AiModelBlock, { type: 'tool_call' }>;

/** Which intent wins when several tools ran in one turn. */
const INTENT_PRIORITY: EAiIntent[] = [
  EAiIntent.Delete,
  EAiIntent.Create,
  EAiIntent.Update,
  EAiIntent.Calculate,
  EAiIntent.Report,
  EAiIntent.Query,
  EAiIntent.Search,
  EAiIntent.Navigate,
  EAiIntent.Explain,
];

class TurnState {
  readonly cards: AiCard[] = [];
  readonly actions: AiPendingAction[] = [];
  readonly intents: EAiIntent[] = [];
  readonly tools: string[] = [];
  toolCalls = 0;

  get progressed(): boolean {
    return this.cards.length > 0 || this.actions.length > 0;
  }

  intent(): EAiIntent {
    return INTENT_PRIORITY.find((intent) => this.intents.includes(intent)) ?? EAiIntent.Unknown;
  }
}

/**
 * The one orchestrator behind every assistant message: loads the conversation, sends the model the person's message
 * with the tools their role allows, checks every tool call it makes (known tool, permission, strict input), runs
 * reads, turns writes into previews bound to their exact payload, and returns a typed answer. Bounded per turn by
 * model calls, tool calls and a time budget that fits the API's 29 s limit.
 */
@Injectable()
export class AiOrchestratorService {
  constructor(
    private readonly config: AiConfig,
    @Inject(AI_LANGUAGE_MODEL) private readonly llm: IAiLanguageModel,
    private readonly registry: AiToolRegistry,
    @Inject(AI_CONVERSATIONS_REPOSITORY) private readonly conversations: IAiConversationsRepository,
    @Inject(AI_MESSAGES_REPOSITORY) private readonly messages: IAiMessagesRepository,
    @Inject(AI_ACTIONS_REPOSITORY) private readonly actions: IAiActionsRepository,
    @Inject(AI_AUDIT_LOG) private readonly audit: IAiAuditLog,
    @Inject(AI_USAGE_REPOSITORY) private readonly usage: IAiUsageRepository,
    @Inject(AI_QUEUE) private readonly queue: IAiQueue,
    @Inject(AI_PREFERENCES_REPOSITORY) private readonly preferences: IAiPreferencesRepository,
    @Inject(AI_PROGRESS_NOTIFIER) private readonly progress: IAiProgressNotifier,
    @InjectPinoLogger(AiOrchestratorService.name) private readonly logger: PinoLogger,
  ) {}

  async chat(actor: AiActor, input: AiChatInput): Promise<AiChatResponse> {
    const limits = this.config.limits;
    const text = (input.message ?? '').trim();
    if (!text) throw new BadRequestException('Type a message.');
    if (text.length > limits.maxMessageChars) {
      throw new BadRequestException(`Messages can be up to ${limits.maxMessageChars} characters.`);
    }
    if (!this.llm.configured) {
      throw new ServiceUnavailableException({
        code: 'AI_NOT_CONFIGURED',
        message: 'The AI assistant is not set up yet.',
      });
    }
    if ((await this.usage.countTurnsSince(actor.actorUserId, startOfUtcDay())) >= limits.dailyMessages) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'AI_DAILY_LIMIT',
          message: `You have used today's ${limits.dailyMessages} assistant messages. Try again tomorrow.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const conversation = input.conversationId
      ? await this.conversations.findForActor(input.conversationId, actor.shopId, actor.actorUserId)
      : await this.conversations.create({
          shopId: actor.shopId,
          actorUserId: actor.actorUserId,
          title: titleFrom(text),
        });
    if (!conversation) throw new NotFoundException('Conversation not found');

    if (input.clientMessageId) {
      const earlier = await this.messages.findByClientMessageId(conversation.id, input.clientMessageId);
      if (earlier?.response) return { ...(earlier.response as AiChatResponse), replayed: true };
      if (earlier) {
        if (Date.now() - earlier.message.createdAt.getTime() < limits.inFlightTurnMs) {
          throw new ConflictException({
            code: 'AI_TURN_IN_PROGRESS',
            message: 'Still working on your previous message.',
          });
        }
        await this.messages.deleteTurn(conversation.id, earlier.message.turnIndex);
      }
    }

    const now = new Date();
    const turnIndex = await this.conversations.nextTurn(conversation.id);
    const [open, prefs] = await Promise.all([
      this.actions.listOpenForConversation(conversation.id, now),
      this.preferences.get(actor.actorUserId).catch(() => DEFAULT_AI_PREFERENCES),
    ]);
    const userBlocks: AiStoredBlock[] = [
      { type: 'text', text },
      { type: 'context', text: contextText(actor, input.page, open, now, prefs, input.voice) },
    ];
    if (input.voice) {
      userBlocks.push({
        type: 'transcript',
        original: input.voice.original.slice(0, limits.maxMessageChars),
        language: input.voice.language,
        confidence: input.voice.confidence,
        flags: input.voice.flags.slice(0, 10),
      });
    }
    try {
      await this.messages.append(conversation.id, [
        { turnIndex, seq: 0, role: 'user', content: userBlocks, clientMessageId: input.clientMessageId ?? null },
      ]);
    } catch (err) {
      if (err instanceof AiBusinessError && err.code === 'CONFLICT') {
        throw new ConflictException({
          code: 'AI_TURN_IN_PROGRESS',
          message: 'Still working on your previous message.',
        });
      }
      throw err;
    }

    try {
      const report = (step: 'thinking' | 'tool' | 'writing', label: string) =>
        void this.progress.notify(actor, {
          clientMessageId: input.clientMessageId ?? null,
          conversationId: conversation.id,
          step,
          label,
        });
      return await this.runTurn(actor, conversation, turnIndex, userBlocks, now, report);
    } catch (err) {
      // Nothing useful happened: forget the turn so the person can simply send it again — and a conversation this
      // message started, so a failed first message leaves no empty conversation behind (a retry starts a new one).
      await this.messages.deleteTurn(conversation.id, turnIndex).catch(() => undefined);
      if (!input.conversationId) {
        await this.actions.cancelOpenForConversation(conversation.id).catch(() => undefined);
        await this.conversations.delete(conversation.id).catch(() => undefined);
      }
      throw err;
    }
  }

  private async runTurn(
    actor: AiActor,
    conversation: AiConversation,
    turnIndex: number,
    userBlocks: AiStoredBlock[],
    now: Date,
    report: (step: 'thinking' | 'tool' | 'writing', label: string) => void,
  ): Promise<AiChatResponse> {
    const limits = this.config.limits;
    const deadline = Date.now() + limits.turnBudgetMs;
    const transcript: AiModelMessage[] = [
      ...(await this.history(conversation, turnIndex)),
      { role: 'user', content: storedToModelBlocks(userBlocks) },
    ];
    const specs = this.registry.forActor(actor).map((tool) => this.registry.spec(tool));
    const ctx: AiToolContext = { actor, conversationId: conversation.id, now };
    const state = new TurnState();
    let seq = 1;
    let modelCalls = 0;
    let finalText = '';
    let lastStoredRole: 'assistant' | 'tool' = 'tool';

    for (;;) {
      const remaining = deadline - Date.now();
      if (modelCalls >= limits.maxModelCalls || remaining < 2_500) {
        finalText = stopText(state);
        break;
      }
      modelCalls++;
      report(
        modelCalls === 1 ? 'thinking' : 'writing',
        modelCalls === 1 ? 'Reading your message…' : 'Writing the answer…',
      );
      let result: AiGenerateResult;
      try {
        result = await this.llm.generate({
          system: AI_SYSTEM_PROMPT,
          messages: transcript,
          tools: specs,
          timeoutMs: Math.min(remaining, this.config.llm.timeoutMs),
          endUserId: opaqueUserId(actor),
        });
      } catch (err) {
        await this.recordModelFailure(actor, conversation.id, err);
        if (state.progressed) {
          finalText = stopText(state);
          break;
        }
        throw toHttpError(err);
      }
      await this.recordUsage(actor, conversation.id, result);

      if (result.stopReason === 'refusal') {
        await this.audit.record({
          event: EAiAuditEvent.ModelRefusal,
          ...who(actor, conversation.id),
          data: { turnIndex },
        });
        finalText = "Sorry, I can't help with that.";
        break;
      }

      transcript.push({ role: 'assistant', content: result.content });
      await this.messages.append(conversation.id, [
        { turnIndex, seq: seq++, role: 'assistant', content: modelToStoredBlocks(result.content) },
      ]);
      lastStoredRole = 'assistant';

      const calls = result.content.filter((b): b is ToolCall => b.type === 'tool_call');
      if (!calls.length) {
        finalText =
          textOf(result.content) ||
          (result.stopReason === 'max_tokens'
            ? 'Sorry, that answer got too long. Please ask in a shorter way.'
            : stopText(state));
        break;
      }

      const results: AiModelBlock[] = [];
      for (const call of calls) {
        report('tool', progressLabel(call.name));
        results.push(await this.dispatch(call, ctx, state, turnIndex));
      }
      transcript.push({ role: 'user', content: results });
      await this.messages.append(conversation.id, [
        { turnIndex, seq: seq++, role: 'tool', content: modelToStoredBlocks(results) },
      ]);
      lastStoredRole = 'tool';
    }

    // The turn ended without a model reply after the last tool results: store ours so the history stays well formed.
    if (lastStoredRole === 'tool') {
      await this.messages.append(conversation.id, [
        { turnIndex, seq: seq++, role: 'assistant', content: [{ type: 'text', text: finalText }] },
      ]);
    }

    const response: AiChatResponse = {
      conversationId: conversation.id,
      turnIndex,
      intent: state.intent(),
      message: { text: finalText },
      cards: state.cards,
      actions: state.actions.map((action) => toActionView(action)),
      replayed: false,
    };
    await this.messages.saveResponse(conversation.id, turnIndex, response);
    await this.conversations.touch(conversation.id, new Date());
    await this.audit.record({
      event: EAiAuditEvent.ChatTurn,
      ...who(actor, conversation.id),
      data: { turnIndex, intent: response.intent, modelCalls, tools: state.tools, previews: state.actions.length },
    });
    await this.maybeSummarize(conversation, turnIndex);
    return response;
  }

  /** One tool call from the model: known tool, allowed for this person, strict input — then run or preview. */
  private async dispatch(
    call: ToolCall,
    ctx: AiToolContext,
    state: TurnState,
    turnIndex: number,
  ): Promise<AiModelBlock> {
    const { actor } = ctx;
    if (state.toolCalls >= this.config.limits.maxToolCalls) {
      return toolResult(
        call,
        {
          status: 'error',
          error: 'step_limit',
          message: 'Too many steps for one message. Stop and tell the person what you have so far.',
        },
        true,
      );
    }
    state.toolCalls++;

    const tool = this.registry.byWireName(call.name);
    if (!tool) {
      await this.audit.record({
        event: EAiAuditEvent.ToolRejected,
        ...who(actor, ctx.conversationId),
        data: { name: String(call.name).slice(0, 64), turnIndex },
      });
      return toolResult(
        call,
        {
          status: 'error',
          error: 'unknown_tool',
          message: 'There is no such tool. Use only the tools you were given.',
        },
        true,
      );
    }
    state.tools.push(tool.action);
    if (tool.permission.module && !actorCan(actor, tool.permission.module, tool.permission.level)) {
      await this.audit.record({
        event: EAiAuditEvent.ToolDenied,
        ...who(actor, ctx.conversationId),
        action: tool.action,
        data: { turnIndex },
      });
      return toolResult(
        call,
        {
          status: 'error',
          error: 'permission_denied',
          message: `This person does not have ${tool.permission.level} access to ${tool.permission.module} in this shop. Tell them to ask the shop owner.`,
        },
        true,
      );
    }
    const parsed = parseToolInput(tool.input, call.input ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.') || 'input'}: ${i.message}`);
      return toolResult(call, { status: 'error', error: 'invalid_input', issues }, true);
    }

    try {
      const outcome = isWriteTool(tool) ? await tool.prepare(parsed.data, ctx) : await tool.run(parsed.data, ctx);
      return await this.applyOutcome(tool, call, outcome, ctx, state, turnIndex);
    } catch (err) {
      if (err instanceof AiBusinessError) {
        return toolResult(call, { status: 'error', error: err.code.toLowerCase(), message: err.message }, true);
      }
      this.logger.error({ err, action: tool.action }, 'AI tool failed');
      await this.audit.record({
        event: EAiAuditEvent.ToolFailed,
        ...who(actor, ctx.conversationId),
        action: tool.action,
        data: { turnIndex },
      });
      return toolResult(
        call,
        {
          status: 'error',
          error: 'tool_failed',
          message: 'The tool failed. Tell the person it did not work and to try again later.',
        },
        true,
      );
    }
  }

  private async applyOutcome(
    tool: AiTool,
    call: ToolCall,
    outcome: AiToolOutcome,
    ctx: AiToolContext,
    state: TurnState,
    turnIndex: number,
  ): Promise<AiModelBlock> {
    const { actor } = ctx;
    switch (outcome.kind) {
      case 'result': {
        const data = tool.output.safeParse(outcome.data);
        if (!data.success) {
          this.logger.error(
            { action: tool.action, issues: data.error.issues.slice(0, 3) },
            'AI tool returned data off its output schema',
          );
          return toolResult(call, { status: 'error', error: 'tool_failed', message: 'The tool failed.' }, true);
        }
        state.intents.push(tool.intent);
        if (outcome.card) state.cards.push(outcome.card);
        if (tool.auditReads) {
          await this.audit.record({
            event: EAiAuditEvent.ToolExecuted,
            ...who(actor, ctx.conversationId),
            action: tool.action,
            data: { turnIndex },
          });
        }
        return toolResult(call, { status: 'ok', data: data.data });
      }
      case 'needs_input':
        state.intents.push(tool.intent);
        return toolResult(call, {
          status: 'needs_input',
          missing: outcome.missing,
          known: outcome.known,
          instruction: 'Ask the person for the missing details in one short question. Do not guess them.',
        });
      case 'ambiguous':
        state.intents.push(tool.intent);
        if (outcome.card) state.cards.push(outcome.card);
        return toolResult(call, { status: 'ambiguous', message: outcome.message, candidates: outcome.candidates });
      case 'rejected':
        state.intents.push(tool.intent);
        return toolResult(call, { status: 'rejected', message: outcome.message });
      case 'proposal': {
        if (!isWriteTool(tool)) return toolResult(call, { status: 'error', error: 'tool_failed' }, true);
        if (state.actions.length >= this.config.limits.maxProposalsPerTurn) {
          return toolResult(
            call,
            {
              status: 'error',
              error: 'too_many_previews',
              message: 'Prepare at most 3 changes per message; ask the person to confirm these first.',
            },
            true,
          );
        }
        const parameters = tool.parameters.safeParse(outcome.parameters);
        if (!parameters.success) {
          this.logger.error(
            { action: tool.action, issues: parameters.error.issues.slice(0, 3) },
            'AI proposal failed its parameter schema',
          );
          return toolResult(call, { status: 'error', error: 'tool_failed', message: 'The tool failed.' }, true);
        }
        const payload: Record<string, unknown> = parameters.data;
        const action = await this.actions.create({
          conversationId: ctx.conversationId,
          turnIndex,
          shopId: actor.shopId,
          actorUserId: actor.actorUserId,
          action: tool.action,
          intent: tool.intent,
          parameters: payload,
          preview: outcome.preview,
          payloadHash: actionPayloadHash({
            action: tool.action,
            parameters: payload,
            shopId: actor.shopId,
            actorUserId: actor.actorUserId,
          }),
          status: EAiActionStatus.AwaitingConfirmation,
          expiresAt: new Date(ctx.now.getTime() + this.config.limits.pendingActionTtlMs),
        });
        state.actions.push(action);
        state.intents.push(tool.intent);
        await this.audit.record({
          event: EAiAuditEvent.ActionProposed,
          ...who(actor, ctx.conversationId),
          actionId: action.id,
          action: tool.action,
          data: {
            turnIndex,
            lifecycle: [EAiActionStatus.Proposed, EAiActionStatus.Validated, EAiActionStatus.AwaitingConfirmation],
            expiresAt: action.expiresAt.toISOString(),
          },
        });
        return toolResult(call, {
          status: 'awaiting_confirmation',
          actionId: action.id,
          preview: outcome.preview.summary,
          warnings: outcome.preview.warnings ?? [],
          note: 'Nothing is saved yet. The app shows this preview as a card; the person must tap Confirm.',
        });
      }
    }
  }

  private async history(conversation: AiConversation, turnIndex: number): Promise<AiModelMessage[]> {
    const from = Math.max(conversation.summaryUptoTurn + 1, turnIndex - this.config.limits.historyTurns);
    const stored = from <= turnIndex - 1 ? await this.messages.listTurns(conversation.id, from, turnIndex - 1) : [];
    const history = buildModelHistory(stored);
    if (conversation.summary) {
      history.unshift({
        role: 'user',
        content: [
          {
            type: 'text',
            text: `[Summary of the earlier part of this conversation, for context]\n${conversation.summary}`,
          },
        ],
      });
    }
    return buildModelHistoryFromModel(history);
  }

  private async maybeSummarize(conversation: AiConversation, turnIndex: number): Promise<void> {
    const limits = this.config.limits;
    if (turnIndex - conversation.summaryUptoTurn <= limits.summarizeAfterTurns || !this.queue.enabled) return;
    const uptoTurn = turnIndex - limits.historyTurns;
    try {
      await this.queue.enqueue(
        { type: 'conversation.summarize', conversationId: conversation.id, uptoTurn },
        { deduplicationId: `ai-summary-${conversation.id}-${uptoTurn}` },
      );
    } catch (err) {
      this.logger.warn({ err, conversationId: conversation.id }, 'Could not queue the conversation summary');
    }
  }

  private async recordUsage(actor: AiActor, conversationId: string, result: AiGenerateResult): Promise<void> {
    await this.usage.record({
      shopId: actor.shopId,
      actorUserId: actor.actorUserId,
      conversationId,
      kind: 'chat',
      provider: this.llm.provider,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      latencyMs: result.latencyMs,
      toolCalls: result.content.filter((b) => b.type === 'tool_call').length,
      outcome: result.stopReason === 'refusal' ? 'refusal' : result.stopReason === 'max_tokens' ? 'max_tokens' : 'ok',
    });
  }

  private async recordModelFailure(actor: AiActor, conversationId: string, err: unknown): Promise<void> {
    const kind = err instanceof AiModelError ? err.kind : 'unknown';
    this.logger.warn({ err, kind }, 'AI model call failed');
    await this.audit.record({ event: EAiAuditEvent.ModelError, ...who(actor, conversationId), data: { kind } });
    await this.usage.record({
      shopId: actor.shopId,
      actorUserId: actor.actorUserId,
      conversationId,
      kind: 'chat',
      provider: this.llm.provider,
      model: this.llm.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      latencyMs: 0,
      toolCalls: 0,
      outcome: 'error',
    });
  }
}

/** History from earlier turns, merged with the summary (consecutive user turns become one). */
function buildModelHistoryFromModel(history: AiModelMessage[]): AiModelMessage[] {
  const out: AiModelMessage[] = [];
  for (const message of history) {
    const last = out[out.length - 1];
    if (last && last.role === message.role) last.content = [...last.content, ...message.content];
    else out.push({ role: message.role, content: [...message.content] });
  }
  return out;
}

function toolResult(call: ToolCall, payload: Record<string, unknown>, isError = false): AiModelBlock {
  return { type: 'tool_result', toolCallId: call.id, content: JSON.stringify(payload), isError };
}

const who = (actor: AiActor, conversationId: string) => ({
  shopId: actor.shopId,
  actorUserId: actor.actorUserId,
  conversationId,
});

function stopText(state: TurnState): string {
  if (state.actions.length) return 'Here is the preview — check it and tap Confirm to save.';
  if (state.cards.length) return 'Here is what I found.';
  return 'Sorry, I could not finish that. Please try again.';
}

/** What the app shows while a tool runs (the wire name's area decides). */
function progressLabel(wireName: string): string {
  const area = wireName.split('_')[0];
  const labels: Record<string, string> = {
    inventory: 'Checking stock…',
    customers: 'Looking up customers…',
    loans: 'Checking loans…',
    dues: 'Checking dues…',
    payments: 'Preparing the payment…',
    deposits: 'Checking deposits…',
    reports: 'Adding up the numbers…',
    knowledge: 'Looking it up…',
    app: 'Finding the screen…',
  };
  return labels[area] ?? 'Working on it…';
}

const LANGUAGE_NOTE: Record<AiPreferences['language'], string | null> = {
  auto: null,
  en: 'Reply in English.',
  hi: 'Reply in Hindi (Devanagari script).',
  hinglish: 'Reply in Hinglish (Hindi in Latin letters).',
};

/** Per-turn context for the model. Stored with the person's message, so the history stays append-only. */
function contextText(
  actor: AiActor,
  page: string | undefined,
  open: AiPendingAction[],
  now: Date,
  prefs: AiPreferences = DEFAULT_AI_PREFERENCES,
  voice?: AiVoiceTurnContext,
): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const lines = [`Today: ${date} (India)`, `Role in this shop: ${actor.shopRole}`];
  const language = LANGUAGE_NOTE[prefs.language];
  if (language) lines.push(`Language preference (overrides the language of the message): ${language}`);
  if (prefs.replyStyle === 'detailed')
    lines.push("Person's preference: a little more detail is welcome (up to 5 lines).");
  if (voice) {
    lines.push(
      'Channel: voice. The person spoke this message; it was transcribed automatically and may contain recognition mistakes. If a number, weight, amount or name looks wrong or unclear, ask before preparing anything.',
    );
    if (voice.language) lines.push(`Speech language detected: ${voice.language}`);
    const regional = voice.flags
      .filter((f) => f.startsWith('unit:'))
      .map((f) => f.slice(5))
      .filter((u) => u !== 'tola');
    if (regional.length) {
      lines.push(
        `Traditional units said: ${regional.join(', ')}. Do not convert them yourself — ask for the weight in grams (or the purity in %).`,
      );
    }
    lines.push(
      voice.confirmableByVoice.length
        ? 'Voice confirmation: stock and customer previews can be saved by saying "confirm"; loans, payments and deposits need a tap on Confirm.'
        : 'Voice confirmation is off: every preview needs a tap on Confirm.',
    );
    lines.push('Your reply may be read aloud: one or two short sentences, no lists, tables or symbols.');
  }
  const screen = page && /^\/[a-z0-9/_-]{0,80}$/i.test(page) ? page : null;
  if (screen) lines.push(`Screen: ${screen}`);
  if (open.length) {
    lines.push('Previews waiting for the person to confirm:');
    for (const action of open.slice(0, 5))
      lines.push(`- ${action.action}: ${action.preview.summary} (id ${action.id})`);
  }
  return `<app_context>\n${lines.join('\n')}\n</app_context>`;
}

function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** A stable, non-reversible id for the provider's abuse monitoring (no names, emails or shop ids leave us). */
function opaqueUserId(actor: AiActor): string {
  return createHash('sha256').update(`bb-ai:${actor.actorUserId}`).digest('hex').slice(0, 32);
}

function toHttpError(err: unknown): HttpException {
  if (err instanceof AiModelError) {
    if (err.kind === 'timeout')
      return new GatewayTimeoutException({
        code: 'AI_TIMEOUT',
        message: 'The assistant took too long. Please try again.',
      });
    if (err.kind === 'quota') {
      return new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'AI_QUOTA',
          message: "The assistant has used today's AI allowance. It is back after 5:30 AM (India time).",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (err.kind === 'rate_limit' || err.kind === 'unavailable' || err.kind === 'auth') {
      return new ServiceUnavailableException({
        code: 'AI_UNAVAILABLE',
        message: 'The assistant is busy right now. Please try again in a minute.',
      });
    }
    if (err.kind === 'not_configured')
      return new ServiceUnavailableException({
        code: 'AI_NOT_CONFIGURED',
        message: 'The AI assistant is not set up yet.',
      });
  }
  return new ServiceUnavailableException({
    code: 'AI_ERROR',
    message: 'The assistant could not answer. Please try again.',
  });
}
