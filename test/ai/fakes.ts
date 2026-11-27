/** In-memory stand-ins for the AI module's ports, so the orchestrator and the action lifecycle run without I/O. */
import { randomUUID } from 'node:crypto';

import { MemoryCustomers, MemoryDeposits, MemoryLoans, MemoryPreferences, MemoryProgress } from './lending-fakes';
import { AiConfig } from '../../src/ai/ai.config';
import {
  AiActionTransition,
  AiActor,
  AiAuditEntry,
  AiBusinessError,
  AiConversation,
  AiGenerateRequest,
  AiGenerateResult,
  AiInventoryItem,
  AiInventorySearch,
  AiInventoryWriteInput,
  AiMessage,
  AiNewMessage,
  AiPendingAction,
  AiStoredBlock,
  AiUsageEntry,
  EAiActionStatus,
  EAiAuditEvent,
  IAiActionsRepository,
  IAiActivityLog,
  IAiAuditLog,
  IAiConversationsRepository,
  IAiExecutionsRepository,
  IAiInventoryGateway,
  IAiLanguageModel,
  IAiMessagesRepository,
  IAiQueue,
  IAiUsageRepository,
} from '../../src/ai/application';
import { AiActionsService } from '../../src/ai/application/services/ai-actions.service';
import { AiConversationsService } from '../../src/ai/application/services/ai-conversations.service';
import type { AiKnowledgeService } from '../../src/ai/application/services/ai-knowledge.service';
import { AiOrchestratorService } from '../../src/ai/application/services/ai-orchestrator.service';
import {
  AiToolRegistry,
  appNavigateTool,
  customersTools,
  depositsTools,
  inventoryTools,
  knowledgeSearchTool,
  loansTools,
  reportsOverviewTool,
} from '../../src/ai/application/tools';

export const SHOP = '11111111-1111-4111-8111-111111111111';
export const OTHER_SHOP = '22222222-2222-4222-8222-222222222222';
export const STAFF = '33333333-3333-4333-8333-333333333333';

const ALL_EDIT = Object.fromEntries(
  ['customers', 'loans', 'inventory', 'billing', 'catalog', 'marketing', 'whatsapp', 'reports', 'settings', 'team'].map(
    (m) => [m, 'edit'],
  ),
);
export const owner = (shopId = SHOP): AiActor => ({
  shopId,
  actorUserId: shopId,
  shopRole: 'owner',
  permissions: ALL_EDIT,
});
export const viewer = (): AiActor => ({
  shopId: SHOP,
  actorUserId: STAFF,
  shopRole: 'viewer',
  permissions: { ...Object.fromEntries(Object.keys(ALL_EDIT).map((m) => [m, 'view'])), team: 'none' },
});
export const staff = (): AiActor => ({
  ...viewer(),
  shopRole: 'staff',
  permissions: { ...viewer().permissions, inventory: 'edit' },
});

const noop = (): undefined => undefined;
export const silentLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  trace: noop,
  fatal: noop,
  setContext: noop,
} as never;

// ------------------------------------------------------------------ model

type Step = (request: AiGenerateRequest, call: number) => Partial<AiGenerateResult> | Error;

/** A model that plays a script: one step per call, and records every request it got. */
export class ScriptedModel implements IAiLanguageModel {
  readonly provider = 'fake';
  readonly model = 'fake-model';
  configured = true;
  readonly capabilities = { toolCalling: true, strictTools: false, promptCaching: false, streaming: false };
  readonly requests: AiGenerateRequest[] = [];
  private steps: Step[] = [];

  script(...steps: Step[]): this {
    this.steps.push(...steps);
    return this;
  }

  generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    this.requests.push(JSON.parse(JSON.stringify(request)) as AiGenerateRequest);
    const step = this.steps.shift();
    if (!step) return Promise.reject(new Error(`Unexpected model call #${this.requests.length}`));
    const out = step(request, this.requests.length);
    if (out instanceof Error) return Promise.reject(out);
    return Promise.resolve({
      content: [],
      stopReason: 'end_turn',
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
      model: this.model,
      latencyMs: 5,
      ...out,
    });
  }
}

let callSeq = 0;
export const callTool =
  (name: string, input: unknown): Step =>
  () => ({
    content: [{ type: 'tool_call', id: `toolu_${++callSeq}`, name, input }],
    stopReason: 'tool_use',
  });
export const say =
  (text: string): Step =>
  () => ({ content: [{ type: 'text', text }], stopReason: 'end_turn' });

/** The tool results the model received in the latest request. */
export function lastToolResults(model: ScriptedModel): Record<string, unknown>[] {
  const request = model.requests[model.requests.length - 1];
  const last = request.messages[request.messages.length - 1];
  return last.content
    .filter((b) => b.type === 'tool_result')
    .map((b) => JSON.parse((b as { content: string }).content) as Record<string, unknown>);
}

// ------------------------------------------------------------------ repositories

export class MemoryConversations implements IAiConversationsRepository {
  readonly rows = new Map<string, AiConversation & { updatedAt: Date }>();
  async create(input: { shopId: string; actorUserId: string; title: string | null }): Promise<AiConversation> {
    const row = {
      id: randomUUID(),
      ...input,
      turnCount: 0,
      summary: null,
      summaryUptoTurn: 0,
      lastMessageAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.set(row.id, row);
    return { ...row };
  }
  async findForActor(id: string, shopId: string, actorUserId: string) {
    const row = this.rows.get(id);
    return row?.shopId === shopId && row.actorUserId === actorUserId ? { ...row } : null;
  }
  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }
  async listForActor(shopId: string, actorUserId: string, limit: number) {
    return [...this.rows.values()].filter((r) => r.shopId === shopId && r.actorUserId === actorUserId).slice(0, limit);
  }
  async nextTurn(id: string) {
    const row = this.rows.get(id)!;
    row.turnCount += 1;
    return row.turnCount;
  }
  async touch(id: string, at: Date) {
    const row = this.rows.get(id);
    if (row) row.lastMessageAt = at;
  }
  async saveSummary(id: string, summary: string, uptoTurn: number) {
    const row = this.rows.get(id);
    if (row && row.summaryUptoTurn < uptoTurn) Object.assign(row, { summary, summaryUptoTurn: uptoTurn });
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
  async listStale(before: Date) {
    return [...this.rows.values()].filter((r) => r.updatedAt < before).map((r) => r.id);
  }
}

export class MemoryMessages implements IAiMessagesRepository {
  readonly rows: AiMessage[] = [];
  async append(conversationId: string, messages: AiNewMessage[]) {
    for (const m of messages) {
      if (
        m.clientMessageId &&
        this.rows.some((r) => r.conversationId === conversationId && r.clientMessageId === m.clientMessageId)
      ) {
        throw new AiBusinessError('duplicate', 'CONFLICT');
      }
      if (
        this.rows.some((r) => r.conversationId === conversationId && r.turnIndex === m.turnIndex && r.seq === m.seq)
      ) {
        throw new AiBusinessError('duplicate position', 'CONFLICT');
      }
      this.rows.push({
        id: randomUUID(),
        conversationId,
        createdAt: new Date(),
        response: null,
        ...m,
        content: JSON.parse(JSON.stringify(m.content)) as AiStoredBlock[],
      });
    }
  }
  async appendEvent(conversationId: string, content: AiStoredBlock[]) {
    const mine = this.rows
      .filter((r) => r.conversationId === conversationId)
      .sort((a, b) => a.turnIndex - b.turnIndex || a.seq - b.seq);
    const last = mine[mine.length - 1];
    await this.append(conversationId, [
      { turnIndex: last?.turnIndex ?? 0, seq: (last?.seq ?? -1) + 1, role: 'event', content },
    ]);
  }
  async listTurns(conversationId: string, fromTurn: number, toTurn: number) {
    return this.rows
      .filter((r) => r.conversationId === conversationId && r.turnIndex >= fromTurn && r.turnIndex <= toTurn)
      .sort((a, b) => a.turnIndex - b.turnIndex || a.seq - b.seq)
      .map((r) => ({ ...r }));
  }
  async findByClientMessageId(conversationId: string, clientMessageId: string) {
    const message = this.rows.find((r) => r.conversationId === conversationId && r.clientMessageId === clientMessageId);
    if (!message) return null;
    const final = this.rows.find(
      (r) => r.conversationId === conversationId && r.turnIndex === message.turnIndex && r.response,
    );
    return { message, response: final?.response ?? null };
  }
  async deleteTurn(conversationId: string, turnIndex: number) {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (this.rows[i].conversationId === conversationId && this.rows[i].turnIndex === turnIndex)
        this.rows.splice(i, 1);
    }
  }
  async saveResponse(conversationId: string, turnIndex: number, response: unknown) {
    const turn = this.rows
      .filter((r) => r.conversationId === conversationId && r.turnIndex === turnIndex)
      .sort((a, b) => b.seq - a.seq);
    if (turn[0]) turn[0].response = JSON.parse(JSON.stringify(response));
  }
}

export class MemoryActions implements IAiActionsRepository {
  readonly rows = new Map<string, AiPendingAction>();
  async create(action: Omit<AiPendingAction, 'id' | 'createdAt'>) {
    const row = {
      ...JSON.parse(JSON.stringify(action)),
      expiresAt: action.expiresAt,
      id: randomUUID(),
      createdAt: new Date(),
    } as AiPendingAction;
    this.rows.set(row.id, row);
    return { ...row };
  }
  async findForActor(id: string, shopId: string, actorUserId: string) {
    const row = this.rows.get(id);
    return row?.shopId === shopId && row.actorUserId === actorUserId ? { ...row } : null;
  }
  async findByIds(ids: string[]) {
    return ids
      .map((id) => this.rows.get(id))
      .filter(Boolean)
      .map((r) => ({ ...r! }));
  }
  async listOpenForConversation(conversationId: string, now: Date) {
    return [...this.rows.values()].filter(
      (r) =>
        r.conversationId === conversationId && r.status === EAiActionStatus.AwaitingConfirmation && r.expiresAt > now,
    );
  }
  /** Same compare-and-set semantics as the SQL version. */
  async transition(id: string, t: AiActionTransition) {
    const row = this.rows.get(id);
    if (!row || !t.from.includes(row.status)) return null;
    if (t.payloadHash && row.payloadHash !== t.payloadHash) return null;
    if (t.notExpiredAt && !(row.expiresAt > t.notExpiredAt)) return null;
    Object.assign(row, t.set ?? {}, { status: t.to });
    return { ...row };
  }
  async cancelOpenForConversation(conversationId: string) {
    let n = 0;
    for (const row of this.rows.values()) {
      if (row.conversationId === conversationId && row.status === EAiActionStatus.AwaitingConfirmation) {
        row.status = EAiActionStatus.Cancelled;
        n++;
      }
    }
    return n;
  }
}

export class MemoryExecutions implements IAiExecutionsRepository {
  readonly rows = new Map<string, { id: string; actionId: string; status: string }>();
  async start(actionId: string, key: string) {
    if (this.rows.has(key)) return null;
    const row = { id: randomUUID(), actionId, status: 'EXECUTING' };
    this.rows.set(key, row);
    return { id: row.id };
  }
  async finish(id: string, outcome: { status: 'COMPLETED' | 'FAILED' }) {
    for (const row of this.rows.values()) if (row.id === id) row.status = outcome.status;
  }
}

export class MemoryAudit implements IAiAuditLog {
  readonly rows: AiAuditEntry[] = [];
  async record(entry: AiAuditEntry) {
    this.rows.push(entry);
  }
  events(): string[] {
    return this.rows.map((r) => r.event);
  }
}

export class MemoryUsage implements IAiUsageRepository {
  readonly rows: AiUsageEntry[] = [];
  constructor(private readonly audit: MemoryAudit) {}
  async record(entry: AiUsageEntry) {
    this.rows.push(entry);
  }
  async countTurnsSince(actorUserId: string) {
    return this.audit.rows.filter((r) => r.event === EAiAuditEvent.ChatTurn && r.actorUserId === actorUserId).length;
  }
  async totals() {
    return { messages: 0, modelCalls: this.rows.length, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  }
}

export class MemoryActivity implements IAiActivityLog {
  readonly rows: Parameters<IAiActivityLog['record']>[0][] = [];
  async record(entry: Parameters<IAiActivityLog['record']>[0]) {
    this.rows.push(entry);
  }
}

export const noQueue: IAiQueue = { enabled: false, enqueue: async () => undefined, verify: async () => false };

// ------------------------------------------------------------------ ByajBazaar inventory

export class MemoryInventory implements IAiInventoryGateway {
  readonly items: (AiInventoryItem & { shopId: string })[] = [];
  readonly calls: { method: string; shopId: string; args: unknown }[] = [];
  failNextCreate: AiBusinessError | null = null;

  add(shopId: string, item: Partial<AiInventoryItem> & { itemName: string; metalType: string }): AiInventoryItem {
    const row = {
      id: randomUUID(),
      sku: `SKU-${this.items.length + 1}`,
      stockQuantity: 1,
      status: 'AVAILABLE',
      ...item,
      shopId,
    };
    this.items.push(row);
    return row;
  }
  async listCategories(shopId: string) {
    this.calls.push({ method: 'listCategories', shopId, args: null });
    return [{ id: '44444444-4444-4444-8444-444444444444', name: 'Anklets' }];
  }
  async create(shopId: string, input: AiInventoryWriteInput) {
    this.calls.push({ method: 'create', shopId, args: input });
    if (this.failNextCreate) {
      const err = this.failNextCreate;
      this.failNextCreate = null;
      throw err;
    }
    return this.add(shopId, input as AiInventoryItem);
  }
  async update(shopId: string, id: string, patch: AiInventoryWriteInput) {
    this.calls.push({ method: 'update', shopId, args: { id, patch } });
    const item = this.items.find((i) => i.id === id && i.shopId === shopId);
    if (!item) throw new AiBusinessError('Inventory item not found', 'NOT_FOUND');
    Object.assign(item, patch);
    return item;
  }
  async get(shopId: string, id: string) {
    this.calls.push({ method: 'get', shopId, args: id });
    return this.items.find((i) => i.id === id && i.shopId === shopId) ?? null;
  }
  async search(shopId: string, q: AiInventorySearch) {
    this.calls.push({ method: 'search', shopId, args: q });
    const items = this.items.filter(
      (i) =>
        i.shopId === shopId &&
        (!q.metalType || i.metalType === q.metalType) &&
        (!q.search ||
          i.itemName.toLowerCase().includes(q.search.toLowerCase()) ||
          i.sku?.toLowerCase() === q.search.toLowerCase()),
    );
    return { total: items.length, items: items.slice(0, q.limit) };
  }
  async summary(shopId: string) {
    this.calls.push({ method: 'summary', shopId, args: null });
    const mine = this.items.filter((i) => i.shopId === shopId);
    return { totalItems: mine.length, availableItems: mine.length, soldItems: 0, totalValuation: 0, categories: [] };
  }
}

// ------------------------------------------------------------------ the assistant, wired with fakes

export function assistant(options: { knowledge?: boolean } = {}) {
  const config = new AiConfig();
  const model = new ScriptedModel();
  const inventory = new MemoryInventory();
  const conversations = new MemoryConversations();
  const messages = new MemoryMessages();
  const actions = new MemoryActions();
  const executions = new MemoryExecutions();
  const audit = new MemoryAudit();
  const usage = new MemoryUsage(audit);
  const activity = new MemoryActivity();
  const customers = new MemoryCustomers();
  const loans = new MemoryLoans();
  const deposits = new MemoryDeposits();
  const preferences = new MemoryPreferences();
  const progress = new MemoryProgress();
  const knowledge = {
    available: options.knowledge ?? false,
    search: async () => [
      {
        score: 0.82,
        chunk: {
          id: 'x',
          collection: 'bb_business_knowledge',
          docKey: 'purity',
          chunkIndex: 0,
          title: 'Purity',
          text: 'Silver 925 is sterling.',
          language: 'en',
          tags: [],
          scope: 'global',
        },
      },
    ],
  } as unknown as AiKnowledgeService;
  const registry = new AiToolRegistry([
    ...inventoryTools(inventory),
    ...customersTools(customers),
    ...loansTools(customers, loans),
    ...depositsTools(customers, deposits),
    reportsOverviewTool(inventory, loans, deposits),
    appNavigateTool(),
    knowledgeSearchTool(knowledge),
  ]);
  const orchestrator = new AiOrchestratorService(
    config,
    model,
    registry,
    conversations,
    messages,
    actions,
    audit,
    usage,
    noQueue,
    preferences,
    progress,
    silentLogger,
  );
  const actionsService = new AiActionsService(registry, actions, executions, messages, audit, activity, silentLogger);
  const conversationsService = new AiConversationsService(config, conversations, messages, actions, audit, usage);
  return {
    config,
    model,
    inventory,
    customers,
    loans,
    deposits,
    preferences,
    progress,
    conversations,
    messages,
    actions,
    executions,
    audit,
    usage,
    activity,
    registry,
    orchestrator,
    actionsService,
    conversationsService,
  };
}
