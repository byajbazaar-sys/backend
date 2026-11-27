import { IS3StorageOptions } from '@shared-libs';

/** Knowledge collections in Qdrant (each one an alias over a versioned physical collection, e.g. `…__v3`). */
export const AI_KNOWLEDGE_COLLECTIONS = [
  'bb_product_knowledge',
  'bb_business_knowledge',
  'bb_help_documents',
  'bb_ai_examples',
] as const;
export type AiKnowledgeCollection = (typeof AI_KNOWLEDGE_COLLECTIONS)[number];

/**
 * ByajBazaar AI (assistant) runs on its own resources, configured with AI_* env vars (on Lambda: the
 * /byajbazaar/<stage>/ai-config SSM parameter, see serverless/ai-config.js):
 *  - database (AI_DB_*): conversations, pending actions, audit and usage — own migrations table `ai_migrations`;
 *  - Qdrant (AI_QDRANT_*): the knowledge collections (falls back to the cluster customer face search uses);
 *  - bucket (AI_S3_*): uploaded knowledge documents (falls back to the main Backblaze bucket, under `ai/`);
 *  - queue (AI_QSTASH_*): knowledge indexing and conversation summaries (falls back to marketing's QStash account).
 * Every value is optional: the model runs on Workers AI through ByajBazaar's Cloudflare account pool, without
 * AI_DB_* the tables live in the main database (like marketing), without Qdrant the assistant simply has no
 * knowledge search, and without the queue jobs run in-process. With no Cloudflare account the assistant answers 503
 * and the rest of ByajBazaar is unaffected.
 */
export class AiConfig {
  readonly db = {
    host: env('AI_DB_HOST') ?? env('DB_HOST') ?? 'localhost',
    port: Number(env('AI_DB_PORT') ?? env('DB_PORT') ?? 5432),
    database: env('AI_DB_NAME') ?? env('DB_NAME') ?? 'byajbazaar_db',
    username: env('AI_DB_USER') ?? env('DB_USER') ?? 'postgres',
    password: env('AI_DB_PASS') ?? env('DB_PASS') ?? 'postgres',
    /** True when a dedicated AI database (e.g. its own Neon project) is configured. */
    dedicated: !!env('AI_DB_HOST'),
  };

  readonly llm = {
    provider: 'workers-ai' as const,
    /** AI_LLM_ENABLED=false turns the assistant off (503) without touching anything else. */
    enabled: env('AI_LLM_ENABLED') !== 'false',
    /**
     * Workers AI chat model with function calling. Gemma 4 26B A4B: tool calling, the best Hindi / Hinglish of the
     * free-plan models in ByajBazaar's checks, and ~9k / 27k neurons per million input / output tokens (Llama 3.3
     * 70B: ~27k / 205k).
     */
    model: env('AI_LLM_MODEL') ?? '@cf/google/gemma-4-26b-a4b-it',
    /** Answers a call the main model failed or rejected. AI_LLM_FALLBACK_MODEL=none turns it off. */
    fallbackModel:
      env('AI_LLM_FALLBACK_MODEL') === 'none'
        ? null
        : (env('AI_LLM_FALLBACK_MODEL') ?? '@cf/meta/llama-4-scout-17b-16e-instruct'),
    /** Replies are a sentence or two plus tool calls; a low cap keeps output neurons down. */
    maxTokens: Number(env('AI_LLM_MAX_TOKENS') ?? 1024) || 1024,
    /** Low: tool choice and field values should be the same every time. */
    temperature: Number(env('AI_LLM_TEMPERATURE') ?? 0.2),
    /** Per model call, account rotation included; the whole turn has its own budget (limits.turnBudgetMs). */
    timeoutMs: Number(env('AI_LLM_TIMEOUT_MS') ?? 15_000) || 15_000,
    /** Cloudflare accounts tried per call (quota, token and server errors move to the next one). */
    maxAttempts: Number(env('AI_LLM_MAX_ATTEMPTS') ?? 3) || 3,
  };

  readonly embeddings = {
    /** Multilingual (English, Hindi, Hinglish) — Workers AI, on ByajBazaar's Cloudflare account pool. */
    model: env('AI_EMBEDDING_MODEL') ?? '@cf/baai/bge-m3',
    dimension: Number(env('AI_EMBEDDING_DIMENSION') ?? 1024) || 1024,
    timeoutMs: Number(env('AI_EMBEDDING_TIMEOUT_MS') ?? 10_000) || 10_000,
  };

  readonly qdrant = {
    url: (env('AI_QDRANT_URL') ?? env('QDRANT_URL') ?? '').replace(/\/+$/, ''),
    apiKey: env('AI_QDRANT_API_KEY') ?? env('QDRANT_API_KEY') ?? '',
    timeoutMs: Number(env('AI_QDRANT_TIMEOUT_MS') ?? 8_000) || 8_000,
    /** Below this cosine similarity a knowledge chunk is not shown to the model. */
    minScore: Number(env('AI_KNOWLEDGE_MIN_SCORE') ?? 0.45) || 0.45,
  };

  readonly storage: IS3StorageOptions = {
    accessKeyId: env('AI_S3_AWS_ACCESS_KEY_ID') ?? env('S3_AWS_ACCESS_KEY_ID') ?? '',
    secretAccessKey: env('AI_S3_AWS_SECRET_ACCESS_KEY') ?? env('S3_AWS_SECRET_ACCESS_KEY') ?? '',
    bucket: env('AI_S3_BUCKET_NAME') ?? env('S3_BUCKET_NAME') ?? '',
    region: env('AI_S3_BUCKET_REGION') ?? env('S3_BUCKET_REGION') ?? 'ap-south-1',
    endpoint: env('AI_S3_ENDPOINT') ?? (env('AI_S3_BUCKET_NAME') ? undefined : env('S3_ENDPOINT')),
  };
  /** Object-key prefix for everything the assistant stores in the bucket. */
  readonly storagePrefix = 'ai/';

  readonly queue = {
    url: (env('AI_QSTASH_URL') ?? env('MARKETING_QSTASH_URL') ?? 'https://qstash.upstash.io').replace(/\/+$/, ''),
    token: env('AI_QSTASH_TOKEN') ?? env('MARKETING_QSTASH_TOKEN'),
    currentSigningKey: env('AI_QSTASH_CURRENT_SIGNING_KEY') ?? env('MARKETING_QSTASH_CURRENT_SIGNING_KEY'),
    nextSigningKey: env('AI_QSTASH_NEXT_SIGNING_KEY') ?? env('MARKETING_QSTASH_NEXT_SIGNING_KEY'),
  };
  /** Public API base (https://api.example.com): QStash delivers jobs to {base}/api/v1/ai/queue. */
  readonly publicApiBaseUrl = (env('AI_API_BASE_URL') ?? env('MARKETING_API_BASE_URL'))?.replace(/\/+$/, '');

  readonly limits = {
    /** Longest message a person can send (characters). */
    maxMessageChars: 2000,
    /** Model calls per turn: one to read the request, the rest after tool results. */
    maxModelCalls: Number(env('AI_MAX_MODEL_CALLS') ?? 4) || 4,
    /** Tool calls the model may make in one turn (all rounds together). */
    maxToolCalls: 8,
    /** New previews (write actions) per turn. */
    maxProposalsPerTurn: 3,
    /** Whole turn, all model calls included — API Gateway cuts the request at 29 s. */
    turnBudgetMs: Number(env('AI_TURN_BUDGET_MS') ?? 24_000) || 24_000,
    /** Recent turns sent back to the model as history (older ones are summarised). */
    historyTurns: 8,
    /** After this many turns past the last summary, the older ones are summarised (queue job). */
    summarizeAfterTurns: 12,
    /** Messages per person per day (UTC), all shops together. */
    dailyMessages: Number(env('AI_DAILY_MESSAGE_LIMIT') ?? 200) || 200,
    /** A preview (pending write action) can be confirmed for this long. */
    pendingActionTtlMs: (Number(env('AI_ACTION_TTL_MINUTES') ?? 15) || 15) * 60_000,
    /** A retried message (same clientMessageId) whose first attempt is still running gets 409 for this long. */
    inFlightTurnMs: 90_000,
  };

  /** Conversations untouched for this long are deleted (messages and previews; audit rows stay). */
  readonly retentionDays = Number(env('AI_RETENTION_DAYS') ?? 90) || 90;

  get queueEnabled(): boolean {
    return !!(this.queue.token && this.queue.currentSigningKey && this.publicApiBaseUrl);
  }

  get knowledgeConfigured(): boolean {
    return !!this.qdrant.url;
  }
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
