import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { buildModelHistory, textOf } from './ai-history';
import { AiKnowledgeService } from './ai-knowledge.service';
import { AI_SUMMARY_PROMPT } from './ai-prompts';
import { AiConfig } from '../../ai.config';
import {
  AI_ACTIONS_REPOSITORY,
  AI_CONVERSATIONS_REPOSITORY,
  AI_LANGUAGE_MODEL,
  AI_MESSAGES_REPOSITORY,
  AI_QUEUE,
  AI_USAGE_REPOSITORY,
  AiJob,
  IAiActionsRepository,
  IAiConversationsRepository,
  IAiLanguageModel,
  IAiMessagesRepository,
  IAiQueue,
  IAiUsageRepository,
} from '../ports';

/** How many stale conversations one purge run deletes (the next run continues). */
const PURGE_BATCH = 200;

/**
 * Background work: knowledge reindexing, conversation summaries and the retention purge. Delivered by the queue
 * (QStash → POST /api/v1/ai/queue); without a queue `submit` runs the job right away.
 */
@Injectable()
export class AiJobsService {
  constructor(
    private readonly config: AiConfig,
    private readonly knowledge: AiKnowledgeService,
    @Inject(AI_QUEUE) private readonly queue: IAiQueue,
    @Inject(AI_LANGUAGE_MODEL) private readonly llm: IAiLanguageModel,
    @Inject(AI_CONVERSATIONS_REPOSITORY) private readonly conversations: IAiConversationsRepository,
    @Inject(AI_MESSAGES_REPOSITORY) private readonly messages: IAiMessagesRepository,
    @Inject(AI_ACTIONS_REPOSITORY) private readonly actions: IAiActionsRepository,
    @Inject(AI_USAGE_REPOSITORY) private readonly usage: IAiUsageRepository,
    @InjectPinoLogger(AiJobsService.name) private readonly logger: PinoLogger,
  ) {}

  /** Queues the job, or runs it now when there is no queue. */
  async submit(job: AiJob, deduplicationId?: string): Promise<{ queued: boolean; result?: unknown }> {
    if (this.queue.enabled) {
      await this.queue.enqueue(job, { deduplicationId });
      return { queued: true };
    }
    return { queued: false, result: await this.run(job) };
  }

  async run(job: AiJob): Promise<unknown> {
    switch (job.type) {
      case 'knowledge.reindex':
        return this.knowledge.reindex(job.collection, job.requestedBy ?? null);
      case 'conversation.summarize':
        return this.summarize(job.conversationId, job.uptoTurn);
      case 'maintenance.purge':
        return this.purge();
    }
  }

  /** Condenses turns up to `uptoTurn` into the conversation summary (older turns are then not resent). */
  async summarize(conversationId: string, uptoTurn: number): Promise<{ summarized: boolean }> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation || uptoTurn <= conversation.summaryUptoTurn || !this.llm.configured) return { summarized: false };
    const stored = await this.messages.listTurns(conversationId, conversation.summaryUptoTurn + 1, uptoTurn);
    const lines: string[] = [];
    if (conversation.summary) lines.push(`Earlier summary: ${conversation.summary}`);
    for (const message of buildModelHistory(stored)) {
      for (const block of message.content) {
        if (block.type === 'text')
          lines.push(`${message.role === 'user' ? 'Person' : 'Assistant'}: ${block.text.slice(0, 600)}`);
        else if (block.type === 'tool_call')
          lines.push(`Assistant used ${block.name}: ${JSON.stringify(block.input).slice(0, 300)}`);
        else if (block.type === 'tool_result') lines.push(`Tool result: ${block.content.slice(0, 300)}`);
      }
    }
    const result = await this.llm.generate({
      system: AI_SUMMARY_PROMPT,
      messages: [
        { role: 'user', content: [{ type: 'text', text: `<transcript>\n${lines.join('\n')}\n</transcript>` }] },
      ],
      tools: [],
      timeoutMs: this.config.llm.timeoutMs,
    });
    await this.usage.record({
      shopId: conversation.shopId,
      actorUserId: conversation.actorUserId,
      conversationId,
      kind: 'summary',
      provider: this.llm.provider,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      latencyMs: result.latencyMs,
      toolCalls: 0,
      outcome: result.stopReason === 'refusal' ? 'refusal' : 'ok',
    });
    const summary = textOf(result.content).slice(0, 4000);
    if (!summary || result.stopReason === 'refusal') return { summarized: false };
    await this.conversations.saveSummary(conversationId, summary, uptoTurn);
    return { summarized: true };
  }

  /** Retention: deletes conversations nobody touched for AI_RETENTION_DAYS (audit rows are kept). */
  async purge(): Promise<{ deleted: number }> {
    const before = new Date(Date.now() - this.config.retentionDays * 86_400_000);
    const ids = await this.conversations.listStale(before, PURGE_BATCH);
    for (const id of ids) {
      await this.actions.cancelOpenForConversation(id);
      await this.conversations.delete(id);
    }
    if (ids.length) this.logger.info({ deleted: ids.length, before }, 'AI conversations purged');
    return { deleted: ids.length };
  }
}
