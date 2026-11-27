/**
 * The model provider, in provider-neutral terms. The orchestrator and the tools only see these types, so switching
 * provider or model changes an adapter (infrastructure/llm), never a business service or a tool definition.
 */
export const AI_LANGUAGE_MODEL = 'AI_LANGUAGE_MODEL';

export interface AiModelCapabilities {
  toolCalling: boolean;
  /** Tool arguments are guaranteed to match the tool's JSON Schema. Validated by us either way. */
  strictTools: boolean;
  promptCaching: boolean;
  streaming: boolean;
}

export type AiModelBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolCallId: string; content: string; isError?: boolean }
  /**
   * A provider-specific block (e.g. a thinking block) that must go back to the provider unchanged within the same
   * turn. Never persisted: history across turns is rebuilt without them.
   */
  | { type: 'opaque'; provider: string; raw: unknown };

export interface AiModelMessage {
  role: 'user' | 'assistant';
  content: AiModelBlock[];
}

export interface AiToolSpec {
  /** Wire name: [a-zA-Z0-9_-]{1,64}. */
  name: string;
  description: string;
  /** JSON Schema of the input (objects closed with additionalProperties: false). */
  inputSchema: Record<string, unknown>;
}

export interface AiGenerateRequest {
  /** Stable across a conversation (cacheable). Per-turn context goes into the latest user message instead. */
  system: string;
  messages: AiModelMessage[];
  tools: AiToolSpec[];
  /** Hard limit for this call; the adapter never waits longer. */
  timeoutMs: number;
  /** Opaque, non-identifying id for the provider's abuse monitoring. */
  endUserId?: string;
}

export interface AiTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AiGenerateResult {
  content: AiModelBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'pause' | 'other';
  usage: AiTokenUsage;
  /** The model that answered (may differ from the configured one after a refusal fallback). */
  model: string;
  latencyMs: number;
}

export interface IAiLanguageModel {
  readonly provider: string;
  readonly model: string;
  /** False when no API key is configured: the assistant answers 503. */
  readonly configured: boolean;
  readonly capabilities: AiModelCapabilities;
  /** One model call. Throws AiModelError. */
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
}
