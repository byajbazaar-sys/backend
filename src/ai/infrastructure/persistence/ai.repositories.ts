import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { In, LessThan } from 'typeorm';

import { AiDatabase } from './ai-database';
import {
  AiActionExecutionEntity,
  AiAuditLogEntity,
  AiConversationEntity,
  AiKnowledgeDocumentEntity,
  AiMessageEntity,
  AiPendingActionEntity,
  AiUsageLogEntity,
  AiUserPreferencesEntity,
} from './entities/ai.entities';
import {
  AiActionTransition,
  AiAuditEntry,
  AiBusinessError,
  AiConversation,
  AiKnowledgeDocument,
  AiMessage,
  AiNewMessage,
  AiPendingAction,
  AiPreferences,
  AiStoredBlock,
  AiUsageEntry,
  AiUsageTotals,
  EAiActionStatus,
  EAiIntent,
  IAiActionsRepository,
  IAiAuditLog,
  IAiConversationsRepository,
  IAiExecutionsRepository,
  IAiKnowledgeDocumentsRepository,
  IAiMessagesRepository,
  IAiPreferencesRepository,
  IAiUsageRepository,
  AI_LANGUAGES,
  AI_REPLY_STYLES,
  AI_SPEECH_LANGUAGES,
  AI_VOICES,
  AiPreferencesUpdate,
  DEFAULT_AI_PREFERENCES,
} from '../../application';

const UNIQUE_VIOLATION = '23505';
const isUniqueViolation = (err: unknown): boolean => {
  const e = err as { code?: string; driverError?: { code?: string } };
  return (e?.code ?? e?.driverError?.code) === UNIQUE_VIOLATION;
};

const toConversation = (e: AiConversationEntity): AiConversation => ({
  id: e.id,
  shopId: e.shopId,
  actorUserId: e.actorUserId,
  title: e.title,
  turnCount: e.turnCount,
  summary: e.summary,
  summaryUptoTurn: e.summaryUptoTurn,
  lastMessageAt: e.lastMessageAt,
  createdAt: e.createdAt,
});

@Injectable()
export class AiConversationsRepository implements IAiConversationsRepository {
  constructor(private readonly db: AiDatabase) {}

  async create(input: { shopId: string; actorUserId: string; title: string | null }): Promise<AiConversation> {
    const repo = await this.db.repository(AiConversationEntity);
    return toConversation(await repo.save(repo.create({ ...input, turnCount: 0, summaryUptoTurn: 0 })));
  }

  async findForActor(id: string, shopId: string, actorUserId: string): Promise<AiConversation | null> {
    const row = await (await this.db.repository(AiConversationEntity)).findOne({ where: { id, shopId, actorUserId } });
    return row ? toConversation(row) : null;
  }

  async findById(id: string): Promise<AiConversation | null> {
    const row = await (await this.db.repository(AiConversationEntity)).findOne({ where: { id } });
    return row ? toConversation(row) : null;
  }

  async listForActor(shopId: string, actorUserId: string, limit: number, before?: Date): Promise<AiConversation[]> {
    const qb = (await this.db.repository(AiConversationEntity))
      .createQueryBuilder('c')
      .where('c.shop_id = :shopId AND c.actor_user_id = :actorUserId', { shopId, actorUserId })
      .orderBy('c.last_message_at', 'DESC', 'NULLS LAST')
      .addOrderBy('c.created_at', 'DESC')
      .limit(limit);
    if (before) qb.andWhere('c.last_message_at < :before', { before });
    return (await qb.getMany()).map(toConversation);
  }

  async nextTurn(id: string): Promise<number> {
    const repo = await this.db.repository(AiConversationEntity);
    const result = await repo
      .createQueryBuilder()
      .update(AiConversationEntity)
      .set({ turnCount: () => 'turn_count + 1' })
      .where('id = :id', { id })
      .returning('turn_count')
      .execute();
    const row = (result.raw as { turn_count?: number; turnCount?: number }[])[0];
    const turn = Number(row?.turn_count ?? row?.turnCount);
    if (!Number.isFinite(turn)) throw new Error('Conversation not found');
    return turn;
  }

  async touch(id: string, at: Date): Promise<void> {
    await (await this.db.repository(AiConversationEntity)).update({ id }, { lastMessageAt: at });
  }

  async saveSummary(id: string, summary: string, uptoTurn: number): Promise<void> {
    await (await this.db.repository(AiConversationEntity))
      .createQueryBuilder()
      .update(AiConversationEntity)
      .set({ summary, summaryUptoTurn: uptoTurn })
      .where('id = :id AND summary_upto_turn < :uptoTurn', { id, uptoTurn })
      .execute();
  }

  async delete(id: string): Promise<void> {
    await (await this.db.repository(AiConversationEntity)).delete({ id });
  }

  async listStale(before: Date, limit: number): Promise<string[]> {
    const rows = await (
      await this.db.repository(AiConversationEntity)
    ).find({
      select: { id: true },
      where: { updatedAt: LessThan(before) },
      order: { updatedAt: 'ASC' },
      take: limit,
    });
    return rows.map((r) => r.id);
  }
}

const toMessage = (e: AiMessageEntity): AiMessage => ({
  id: e.id,
  conversationId: e.conversationId,
  turnIndex: e.turnIndex,
  seq: e.seq,
  role: e.role as AiMessage['role'],
  content: (e.content ?? []) as AiStoredBlock[],
  clientMessageId: e.clientMessageId,
  response: e.response ?? null,
  createdAt: e.createdAt,
});

@Injectable()
export class AiMessagesRepository implements IAiMessagesRepository {
  constructor(private readonly db: AiDatabase) {}

  async append(conversationId: string, messages: AiNewMessage[]): Promise<void> {
    if (!messages.length) return;
    const repo = await this.db.repository(AiMessageEntity);
    try {
      await repo.insert(
        messages.map((m) =>
          repo.create({
            conversationId,
            turnIndex: m.turnIndex,
            seq: m.seq,
            role: m.role,
            content: m.content,
            clientMessageId: m.clientMessageId ?? null,
            response: m.response ?? null,
          }),
        ),
      );
    } catch (err) {
      if (isUniqueViolation(err)) throw new AiBusinessError('This message was already received.', 'CONFLICT');
      throw err;
    }
  }

  async appendEvent(conversationId: string, content: AiStoredBlock[]): Promise<void> {
    const repo = await this.db.repository(AiMessageEntity);
    // After the last message of the latest turn; retried once if a concurrent write took that position.
    for (let attempt = 0; attempt < 2; attempt++) {
      const last = await repo.findOne({ where: { conversationId }, order: { turnIndex: 'DESC', seq: 'DESC' } });
      try {
        await repo.insert(
          repo.create({
            conversationId,
            turnIndex: last?.turnIndex ?? 0,
            seq: (last?.seq ?? -1) + 1,
            role: 'event',
            content,
            clientMessageId: null,
            response: null,
          }),
        );
        return;
      } catch (err) {
        if (!isUniqueViolation(err) || attempt === 1) throw err;
      }
    }
  }

  async listTurns(conversationId: string, fromTurn: number, toTurn: number): Promise<AiMessage[]> {
    if (toTurn < fromTurn) return [];
    const rows = await (await this.db.repository(AiMessageEntity))
      .createQueryBuilder('m')
      .where('m.conversation_id = :conversationId', { conversationId })
      .andWhere('m.turn_index BETWEEN :fromTurn AND :toTurn', { fromTurn, toTurn })
      .orderBy('m.turn_index', 'ASC')
      .addOrderBy('m.seq', 'ASC')
      .getMany();
    return rows.map(toMessage);
  }

  async findByClientMessageId(
    conversationId: string,
    clientMessageId: string,
  ): Promise<{ message: AiMessage; response: unknown } | null> {
    const repo = await this.db.repository(AiMessageEntity);
    const message = await repo.findOne({ where: { conversationId, clientMessageId } });
    if (!message) return null;
    const final = await repo
      .createQueryBuilder('m')
      .where('m.conversation_id = :conversationId AND m.turn_index = :turn AND m.response IS NOT NULL', {
        conversationId,
        turn: message.turnIndex,
      })
      .getOne();
    return { message: toMessage(message), response: final?.response ?? null };
  }

  async deleteTurn(conversationId: string, turnIndex: number): Promise<void> {
    await (await this.db.repository(AiMessageEntity)).delete({ conversationId, turnIndex });
  }

  async redactTranscripts(before: Date): Promise<number> {
    const rows: unknown = await (
      await this.db.connection()
    ).query(
      `UPDATE ai_messages
          SET content = (SELECT COALESCE(jsonb_agg(b), '[]'::jsonb)
                           FROM jsonb_array_elements(content) b
                          WHERE b->>'type' <> 'transcript')
        WHERE created_at < $1
          AND content @> '[{"type":"transcript"}]'::jsonb
        RETURNING id`,
      [before],
    );
    // pg returns [rows, count] for UPDATE … RETURNING through TypeORM's query().
    const list = Array.isArray(rows) && Array.isArray(rows[0]) ? (rows[0] as unknown[]) : (rows as unknown[]);
    return Array.isArray(list) ? list.length : 0;
  }

  async saveResponse(conversationId: string, turnIndex: number, response: unknown): Promise<void> {
    const repo = await this.db.repository(AiMessageEntity);
    const last = await repo.findOne({ where: { conversationId, turnIndex }, order: { seq: 'DESC' } });
    if (last) await repo.update({ id: last.id }, { response: response as object });
  }
}

const toAction = (e: AiPendingActionEntity): AiPendingAction => ({
  id: e.id,
  conversationId: e.conversationId,
  turnIndex: e.turnIndex,
  shopId: e.shopId,
  actorUserId: e.actorUserId,
  action: e.action,
  intent: e.intent as EAiIntent,
  parameters: e.parameters ?? {},
  preview: e.preview as AiPendingAction['preview'],
  payloadHash: e.payloadHash,
  status: e.status as EAiActionStatus,
  expiresAt: e.expiresAt,
  approvedAt: e.approvedAt,
  executedAt: e.executedAt,
  completedAt: e.completedAt,
  result: (e.result ?? null) as AiPendingAction['result'],
  error: e.error,
  entityId: e.entityId,
  createdAt: e.createdAt,
});

/** Raw RETURNING rows come back in column (snake_case) names. */
const fromRaw = (row: Record<string, unknown>): AiPendingActionEntity =>
  ({
    id: row.id,
    conversationId: row.conversation_id,
    turnIndex: row.turn_index,
    shopId: row.shop_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    intent: row.intent,
    parameters: row.parameters,
    preview: row.preview,
    payloadHash: row.payload_hash,
    status: row.status,
    expiresAt: new Date(row.expires_at as string),
    approvedAt: row.approved_at ? new Date(row.approved_at as string) : null,
    executedAt: row.executed_at ? new Date(row.executed_at as string) : null,
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    result: row.result,
    error: row.error,
    entityId: row.entity_id,
    createdAt: new Date(row.created_at as string),
  }) as AiPendingActionEntity;

@Injectable()
export class AiActionsRepository implements IAiActionsRepository {
  constructor(private readonly db: AiDatabase) {}

  async create(action: Omit<AiPendingAction, 'id' | 'createdAt'>): Promise<AiPendingAction> {
    const repo = await this.db.repository(AiPendingActionEntity);
    return toAction(
      await repo.save(
        repo.create({
          ...action,
          preview: action.preview as unknown,
          result: action.result ?? null,
          error: action.error ?? null,
          entityId: action.entityId ?? null,
          approvedAt: action.approvedAt ?? null,
          executedAt: action.executedAt ?? null,
          completedAt: action.completedAt ?? null,
        }),
      ),
    );
  }

  async findForActor(id: string, shopId: string, actorUserId: string): Promise<AiPendingAction | null> {
    const row = await (await this.db.repository(AiPendingActionEntity)).findOne({ where: { id, shopId, actorUserId } });
    return row ? toAction(row) : null;
  }

  async findByIds(ids: string[]): Promise<AiPendingAction[]> {
    if (!ids.length) return [];
    return (await (await this.db.repository(AiPendingActionEntity)).find({ where: { id: In(ids) } })).map(toAction);
  }

  async listOpenForConversation(conversationId: string, now: Date): Promise<AiPendingAction[]> {
    const rows = await (
      await this.db.repository(AiPendingActionEntity)
    )
      .createQueryBuilder('a')
      .where('a.conversation_id = :conversationId AND a.status = :status AND a.expires_at > :now', {
        conversationId,
        status: EAiActionStatus.AwaitingConfirmation,
        now,
      })
      .orderBy('a.created_at', 'ASC')
      .getMany();
    return rows.map(toAction);
  }

  async transition(id: string, t: AiActionTransition): Promise<AiPendingAction | null> {
    const repo = await this.db.repository(AiPendingActionEntity);
    const set: Partial<AiPendingActionEntity> = { status: t.to };
    if (t.set?.approvedAt !== undefined) set.approvedAt = t.set.approvedAt;
    if (t.set?.executedAt !== undefined) set.executedAt = t.set.executedAt;
    if (t.set?.completedAt !== undefined) set.completedAt = t.set.completedAt;
    if (t.set?.result !== undefined) set.result = t.set.result;
    if (t.set?.error !== undefined) set.error = t.set.error;
    if (t.set?.entityId !== undefined) set.entityId = t.set.entityId;
    const qb = repo
      .createQueryBuilder()
      .update(AiPendingActionEntity)
      .set(set)
      .where('id = :id AND status IN (:...from)', { id, from: t.from });
    if (t.payloadHash) qb.andWhere('payload_hash = :hash', { hash: t.payloadHash });
    if (t.notExpiredAt) qb.andWhere('expires_at > :at', { at: t.notExpiredAt });
    const result = await qb.returning('*').execute();
    const row = (result.raw as Record<string, unknown>[])[0];
    return row ? toAction(fromRaw(row)) : null;
  }

  async cancelOpenForConversation(conversationId: string): Promise<number> {
    const result = await (
      await this.db.repository(AiPendingActionEntity)
    )
      .createQueryBuilder()
      .update(AiPendingActionEntity)
      .set({ status: EAiActionStatus.Cancelled })
      .where('conversation_id = :conversationId AND status = :status', {
        conversationId,
        status: EAiActionStatus.AwaitingConfirmation,
      })
      .execute();
    return result.affected ?? 0;
  }
}

@Injectable()
export class AiExecutionsRepository implements IAiExecutionsRepository {
  constructor(private readonly db: AiDatabase) {}

  async start(actionId: string, idempotencyKey: string): Promise<{ id: string } | null> {
    const repo = await this.db.repository(AiActionExecutionEntity);
    try {
      const row = await repo.save(
        repo.create({ actionId, idempotencyKey, status: 'EXECUTING', startedAt: new Date() }),
      );
      return { id: row.id };
    } catch (err) {
      if (isUniqueViolation(err)) return null;
      throw err;
    }
  }

  async finish(
    id: string,
    outcome: { status: 'COMPLETED' | 'FAILED'; result?: unknown; error?: string; durationMs: number },
  ): Promise<void> {
    await (
      await this.db.repository(AiActionExecutionEntity)
    ).update(
      { id },
      {
        status: outcome.status,
        finishedAt: new Date(),
        result: (outcome.result ?? null) as object,
        error: outcome.error ?? null,
        durationMs: outcome.durationMs,
      },
    );
  }
}

@Injectable()
export class AiAuditLogRepository implements IAiAuditLog {
  constructor(
    private readonly db: AiDatabase,
    @InjectPinoLogger(AiAuditLogRepository.name) private readonly logger: PinoLogger,
  ) {}

  async record(entry: AiAuditEntry): Promise<void> {
    try {
      const repo = await this.db.repository(AiAuditLogEntity);
      await repo.insert(
        repo.create({
          event: entry.event,
          shopId: entry.shopId ?? null,
          actorUserId: entry.actorUserId ?? null,
          conversationId: entry.conversationId ?? null,
          actionId: entry.actionId ?? null,
          action: entry.action ?? null,
          data: entry.data ?? null,
        }),
      );
    } catch (err) {
      this.logger.warn({ err, event: entry.event }, 'AI audit entry could not be written');
    }
  }
}

@Injectable()
export class AiUsageRepository implements IAiUsageRepository {
  constructor(
    private readonly db: AiDatabase,
    @InjectPinoLogger(AiUsageRepository.name) private readonly logger: PinoLogger,
  ) {}

  async record(entry: AiUsageEntry): Promise<void> {
    try {
      const repo = await this.db.repository(AiUsageLogEntity);
      await repo.insert(repo.create({ ...entry, conversationId: entry.conversationId ?? null }));
    } catch (err) {
      this.logger.warn({ err }, 'AI usage entry could not be written');
    }
  }

  async countTurnsSince(actorUserId: string, since: Date): Promise<number> {
    // A turn = the first model call of a chat message; counted from the audit trail of finished turns plus usage.
    const repo = await this.db.repository(AiAuditLogEntity);
    return repo
      .createQueryBuilder('a')
      .where('a.actor_user_id = :actorUserId AND a.event = :event AND a.created_at >= :since', {
        actorUserId,
        event: 'CHAT_TURN',
        since,
      })
      .getCount();
  }

  async totals(filter: { shopId: string; actorUserId?: string; since: Date }): Promise<AiUsageTotals> {
    const qb = (await this.db.repository(AiUsageLogEntity))
      .createQueryBuilder('u')
      .select('COUNT(*)', 'modelCalls')
      .addSelect('COALESCE(SUM(u.input_tokens), 0)', 'inputTokens')
      .addSelect('COALESCE(SUM(u.output_tokens), 0)', 'outputTokens')
      .addSelect('COALESCE(SUM(u.cache_read_tokens), 0)', 'cacheReadTokens')
      .where('u.shop_id = :shopId AND u.created_at >= :since', { shopId: filter.shopId, since: filter.since });
    if (filter.actorUserId) qb.andWhere('u.actor_user_id = :actorUserId', { actorUserId: filter.actorUserId });
    const raw = (await qb.getRawOne<Record<string, string>>()) ?? {};
    const auditQb = (await this.db.repository(AiAuditLogEntity))
      .createQueryBuilder('a')
      .where('a.shop_id = :shopId AND a.event = :event AND a.created_at >= :since', {
        shopId: filter.shopId,
        event: 'CHAT_TURN',
        since: filter.since,
      });
    if (filter.actorUserId) auditQb.andWhere('a.actor_user_id = :actorUserId', { actorUserId: filter.actorUserId });
    return {
      messages: await auditQb.getCount(),
      modelCalls: Number(raw.modelCalls ?? 0),
      inputTokens: Number(raw.inputTokens ?? 0),
      outputTokens: Number(raw.outputTokens ?? 0),
      cacheReadTokens: Number(raw.cacheReadTokens ?? 0),
    };
  }
}

const toDocument = (e: AiKnowledgeDocumentEntity): AiKnowledgeDocument => ({
  id: e.id,
  collection: e.collection,
  docKey: e.docKey,
  shopId: e.shopId,
  title: e.title,
  language: e.language,
  source: e.source as AiKnowledgeDocument['source'],
  storageKey: e.storageKey,
  contentHash: e.contentHash,
  chunkCount: e.chunkCount,
  indexedVersion: e.indexedVersion,
  indexedAt: e.indexedAt,
  createdBy: e.createdBy,
  createdAt: e.createdAt,
});

@Injectable()
export class AiKnowledgeDocumentsRepository implements IAiKnowledgeDocumentsRepository {
  constructor(private readonly db: AiDatabase) {}

  async upsert(doc: Omit<AiKnowledgeDocument, 'id' | 'createdAt'>): Promise<AiKnowledgeDocument> {
    const repo = await this.db.repository(AiKnowledgeDocumentEntity);
    const existing = await repo.findOne({ where: { collection: doc.collection, docKey: doc.docKey } });
    return toDocument(await repo.save(repo.create({ ...(existing ?? {}), ...doc, id: existing?.id })));
  }

  async list(): Promise<AiKnowledgeDocument[]> {
    return (
      await (await this.db.repository(AiKnowledgeDocumentEntity)).find({ order: { collection: 'ASC', docKey: 'ASC' } })
    ).map(toDocument);
  }

  async findById(id: string): Promise<AiKnowledgeDocument | null> {
    const row = await (await this.db.repository(AiKnowledgeDocumentEntity)).findOne({ where: { id } });
    return row ? toDocument(row) : null;
  }

  async markIndexed(ids: string[], version: number, chunkCounts: Map<string, number>, at: Date): Promise<void> {
    const repo = await this.db.repository(AiKnowledgeDocumentEntity);
    for (const id of ids) {
      await repo.update({ id }, { indexedVersion: version, indexedAt: at, chunkCount: chunkCounts.get(id) ?? 0 });
    }
  }

  async delete(id: string): Promise<void> {
    await (await this.db.repository(AiKnowledgeDocumentEntity)).delete({ id });
  }
}

@Injectable()
export class AiPreferencesRepository implements IAiPreferencesRepository {
  constructor(private readonly db: AiDatabase) {}

  async get(actorUserId: string): Promise<AiPreferences> {
    const row = await (await this.db.repository(AiUserPreferencesEntity)).findOne({ where: { actorUserId } });
    return row ? toPreferences(row) : { ...DEFAULT_AI_PREFERENCES };
  }

  async save(actorUserId: string, prefs: AiPreferencesUpdate): Promise<AiPreferences> {
    const repo = await this.db.repository(AiUserPreferencesEntity);
    const next = { ...(await this.get(actorUserId)), ...prefs };
    await repo.upsert(
      {
        actorUserId,
        language: next.language,
        replyStyle: next.replyStyle,
        speakReplies: next.speakReplies,
        speechLanguage: next.speechLanguage,
        voice: next.voice,
      },
      ['actorUserId'],
    );
    return this.get(actorUserId);
  }
}

function toPreferences(row: AiUserPreferencesEntity): AiPreferences {
  return {
    language: (AI_LANGUAGES as readonly string[]).includes(row.language)
      ? (row.language as AiPreferences['language'])
      : 'auto',
    replyStyle: (AI_REPLY_STYLES as readonly string[]).includes(row.replyStyle)
      ? (row.replyStyle as AiPreferences['replyStyle'])
      : 'short',
    speakReplies: row.speakReplies !== false,
    speechLanguage: (AI_SPEECH_LANGUAGES as readonly string[]).includes(row.speechLanguage)
      ? (row.speechLanguage as AiPreferences['speechLanguage'])
      : 'auto',
    voice: (AI_VOICES as readonly string[]).includes(row.voice) ? (row.voice as AiPreferences['voice']) : 'asteria',
    updatedAt: row.updatedAt,
  };
}
