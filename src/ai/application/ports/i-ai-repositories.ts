import type {
  AiAuditEntry,
  AiConversation,
  AiKnowledgeDocument,
  AiMessage,
  AiPendingAction,
  AiPreferences,
  AiStoredBlock,
  AiUsageEntry,
  AiUsageTotals,
  EAiActionStatus,
} from '../domain';

export const AI_CONVERSATIONS_REPOSITORY = 'AI_CONVERSATIONS_REPOSITORY';
export interface IAiConversationsRepository {
  create(input: { shopId: string; actorUserId: string; title: string | null }): Promise<AiConversation>;
  /** Only the person's own conversation in that shop (null otherwise). */
  findForActor(id: string, shopId: string, actorUserId: string): Promise<AiConversation | null>;
  findById(id: string): Promise<AiConversation | null>;
  listForActor(shopId: string, actorUserId: string, limit: number, before?: Date): Promise<AiConversation[]>;
  /** Atomically reserves the next turn number. */
  nextTurn(id: string): Promise<number>;
  touch(id: string, at: Date): Promise<void>;
  saveSummary(id: string, summary: string, uptoTurn: number): Promise<void>;
  /** Deletes the conversation and its messages. */
  delete(id: string): Promise<void>;
  /** Conversations untouched since `before` (for retention). */
  listStale(before: Date, limit: number): Promise<string[]>;
}

export interface AiNewMessage {
  turnIndex: number;
  seq: number;
  role: AiMessage['role'];
  content: AiStoredBlock[];
  clientMessageId?: string | null;
  response?: unknown;
}

export const AI_MESSAGES_REPOSITORY = 'AI_MESSAGES_REPOSITORY';
export interface IAiMessagesRepository {
  append(conversationId: string, messages: AiNewMessage[]): Promise<void>;
  /** Adds one message after everything else in the conversation (an app event between turns). */
  appendEvent(conversationId: string, content: AiStoredBlock[]): Promise<void>;
  /** Messages of turns `fromTurn`..`toTurn` (inclusive), in order. */
  listTurns(conversationId: string, fromTurn: number, toTurn: number): Promise<AiMessage[]>;
  /** The user message of an earlier attempt with this client id, and the turn's stored response if it finished. */
  findByClientMessageId(
    conversationId: string,
    clientMessageId: string,
  ): Promise<{ message: AiMessage; response: unknown } | null>;
  deleteTurn(conversationId: string, turnIndex: number): Promise<void>;
  saveResponse(conversationId: string, turnIndex: number, response: unknown): Promise<void>;
}

export interface AiActionTransition {
  from: EAiActionStatus[];
  to: EAiActionStatus;
  /** Only when the stored payload still has this hash. */
  payloadHash?: string;
  /** Only when it has not expired at this time. */
  notExpiredAt?: Date;
  set?: Partial<Pick<AiPendingAction, 'approvedAt' | 'executedAt' | 'completedAt' | 'result' | 'error' | 'entityId'>>;
}

export const AI_ACTIONS_REPOSITORY = 'AI_ACTIONS_REPOSITORY';
export interface IAiActionsRepository {
  create(action: Omit<AiPendingAction, 'id' | 'createdAt'>): Promise<AiPendingAction>;
  /** Only the person's own action in that shop (null otherwise). */
  findForActor(id: string, shopId: string, actorUserId: string): Promise<AiPendingAction | null>;
  findByIds(ids: string[]): Promise<AiPendingAction[]>;
  listOpenForConversation(conversationId: string, now: Date): Promise<AiPendingAction[]>;
  /**
   * Compare-and-set: moves the action from one of `from` to `to` only if it is still there (and the hash / expiry
   * conditions hold). Returns the updated row, or null when another request got there first.
   */
  transition(id: string, transition: AiActionTransition): Promise<AiPendingAction | null>;
  /** Marks open actions of the conversation cancelled (conversation deleted). */
  cancelOpenForConversation(conversationId: string): Promise<number>;
}

export const AI_EXECUTIONS_REPOSITORY = 'AI_EXECUTIONS_REPOSITORY';
export interface IAiExecutionsRepository {
  /** Records the start of an execution. Returns false if one already exists for this idempotency key. */
  start(actionId: string, idempotencyKey: string): Promise<{ id: string } | null>;
  finish(
    id: string,
    outcome: { status: 'COMPLETED' | 'FAILED'; result?: unknown; error?: string; durationMs: number },
  ): Promise<void>;
}

export const AI_AUDIT_LOG = 'AI_AUDIT_LOG';
export interface IAiAuditLog {
  /** Never throws: an audit failure is logged, never shown to the person. */
  record(entry: AiAuditEntry): Promise<void>;
}

export const AI_USAGE_REPOSITORY = 'AI_USAGE_REPOSITORY';
export interface IAiUsageRepository {
  /** Never throws. */
  record(entry: AiUsageEntry): Promise<void>;
  /** Chat turns the person started since `since` (all shops). */
  countTurnsSince(actorUserId: string, since: Date): Promise<number>;
  totals(filter: { shopId: string; actorUserId?: string; since: Date }): Promise<AiUsageTotals>;
}

export const AI_PREFERENCES_REPOSITORY = 'AI_PREFERENCES_REPOSITORY';
export interface IAiPreferencesRepository {
  /** Defaults when the person never saved any. */
  get(actorUserId: string): Promise<AiPreferences>;
  save(actorUserId: string, prefs: Pick<AiPreferences, 'language' | 'replyStyle'>): Promise<AiPreferences>;
}

export const AI_KNOWLEDGE_DOCUMENTS_REPOSITORY = 'AI_KNOWLEDGE_DOCUMENTS_REPOSITORY';
export interface IAiKnowledgeDocumentsRepository {
  upsert(doc: Omit<AiKnowledgeDocument, 'id' | 'createdAt'>): Promise<AiKnowledgeDocument>;
  list(): Promise<AiKnowledgeDocument[]>;
  findById(id: string): Promise<AiKnowledgeDocument | null>;
  markIndexed(ids: string[], version: number, chunkCounts: Map<string, number>, at: Date): Promise<void>;
  delete(id: string): Promise<void>;
}
