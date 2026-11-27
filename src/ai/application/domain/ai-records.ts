import { EAiActionStatus, EAiAuditEvent, EAiIntent } from './ai-enums';
import type { AiActionPreview, AiCard } from './ai-views';

/**
 * A message block as stored in ai_messages. Provider-specific blocks (e.g. thinking) are never stored: history sent
 * back to the model is rebuilt from text, tool calls and tool results only.
 */
export type AiStoredBlock =
  | { type: 'text'; text: string }
  | { type: 'context'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolCallId: string; content: string; isError?: boolean };

/** user = the person; assistant = the model; tool = tool results; event = something the app did (a confirmation). */
export type AiMessageRole = 'user' | 'assistant' | 'tool' | 'event';

export interface AiConversation {
  id: string;
  shopId: string;
  actorUserId: string;
  title: string | null;
  turnCount: number;
  summary: string | null;
  summaryUptoTurn: number;
  lastMessageAt: Date | null;
  createdAt: Date;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  turnIndex: number;
  seq: number;
  role: AiMessageRole;
  content: AiStoredBlock[];
  clientMessageId?: string | null;
  /** On the turn's last message: the response the person got (replayed for a retried message). */
  response?: unknown;
  createdAt: Date;
}

/**
 * The universal command contract: what the assistant wants to do, in a provider-neutral, validated form.
 * `parameters` never holds shop, user or role ids — those come from the authenticated request.
 */
export interface AiCommand {
  intent: EAiIntent;
  action: string;
  parameters: Record<string, unknown>;
  missingFields: string[];
  requiresConfirmation: boolean;
}

export interface AiPendingAction {
  id: string;
  conversationId: string | null;
  turnIndex: number | null;
  shopId: string;
  actorUserId: string;
  action: string;
  intent: EAiIntent;
  parameters: Record<string, unknown>;
  preview: AiActionPreview;
  payloadHash: string;
  status: EAiActionStatus;
  expiresAt: Date;
  approvedAt?: Date | null;
  executedAt?: Date | null;
  completedAt?: Date | null;
  result?: AiActionResult | null;
  error?: string | null;
  entityId?: string | null;
  createdAt: Date;
}

export interface AiActionResult {
  summary: string;
  data?: unknown;
  card?: AiCard;
}

export interface AiAuditEntry {
  event: EAiAuditEvent;
  shopId?: string | null;
  actorUserId?: string | null;
  conversationId?: string | null;
  actionId?: string | null;
  action?: string | null;
  /** Minimised details: ids, counts, statuses — never message text, names or amounts typed by the person. */
  data?: Record<string, unknown>;
}

export interface AiUsageEntry {
  shopId: string | null;
  actorUserId: string | null;
  conversationId?: string | null;
  kind: 'chat' | 'summary' | 'embedding';
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number;
  toolCalls: number;
  outcome: 'ok' | 'refusal' | 'error' | 'max_tokens';
}

export interface AiUsageTotals {
  messages: number;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface AiKnowledgeDocument {
  id: string;
  collection: string;
  docKey: string;
  /** null = shared knowledge (glossary, help) visible to every shop. */
  shopId: string | null;
  title: string;
  language: string;
  source: 'seed' | 'upload';
  storageKey: string | null;
  contentHash: string;
  chunkCount: number;
  indexedVersion: number | null;
  indexedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

/** How a person wants the assistant to answer (all shops). */
export const AI_LANGUAGES = ['auto', 'en', 'hi', 'hinglish'] as const;
export const AI_REPLY_STYLES = ['short', 'detailed'] as const;
export interface AiPreferences {
  /** auto: the language of each message. */
  language: (typeof AI_LANGUAGES)[number];
  replyStyle: (typeof AI_REPLY_STYLES)[number];
  updatedAt: Date | null;
}
export const DEFAULT_AI_PREFERENCES: AiPreferences = { language: 'auto', replyStyle: 'short', updatedAt: null };
