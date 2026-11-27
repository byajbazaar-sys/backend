import type { AiKnowledgeCollection } from '../../ai.config';

/** Multilingual text embeddings (English, Hindi, Hinglish). */
export const AI_EMBEDDINGS = 'AI_EMBEDDINGS';
export interface IAiEmbeddings {
  readonly model: string;
  readonly dimension: number;
  /** One vector per text, same order. Throws when no provider is available. */
  embed(texts: string[]): Promise<number[][]>;
}

export interface AiKnowledgeChunk {
  /** Stable point id (uuid) — the same document chunk always gets the same id. */
  id: string;
  collection: AiKnowledgeCollection;
  docKey: string;
  chunkIndex: number;
  title: string;
  text: string;
  language: string;
  tags: string[];
  /** 'global' for shared knowledge, else the shop id (tenant filter). */
  scope: string;
}

export interface AiKnowledgeHit {
  chunk: AiKnowledgeChunk;
  score: number;
}

/**
 * The vector index (Qdrant). Holds knowledge only — glossary, help, examples — never customer records, balances or
 * other business data, which always come from PostgreSQL through the business services.
 */
export const AI_KNOWLEDGE_INDEX = 'AI_KNOWLEDGE_INDEX';
export interface IAiKnowledgeIndex {
  readonly configured: boolean;
  /** Version currently served by the collection's alias (null when never indexed). */
  currentVersion(collection: AiKnowledgeCollection): Promise<number | null>;
  /** Creates the next physical collection (with payload indexes) for a full reindex; returns its version. */
  createVersion(collection: AiKnowledgeCollection, dimension: number): Promise<number>;
  upsert(
    collection: AiKnowledgeCollection,
    version: number,
    chunks: AiKnowledgeChunk[],
    vectors: number[][],
  ): Promise<void>;
  /** Points the alias at `version` (atomic swap) and drops older versions. */
  promote(collection: AiKnowledgeCollection, version: number): Promise<void>;
  /** Only chunks whose scope is 'global' or `shopId` are returned. */
  search(
    collections: AiKnowledgeCollection[],
    vector: number[],
    options: { shopId: string; limit: number; minScore: number },
  ): Promise<AiKnowledgeHit[]>;
}

/** Knowledge documents uploaded by admins, kept in the AI bucket (Backblaze B2). */
export const AI_DOCUMENT_STORAGE = 'AI_DOCUMENT_STORAGE';
export interface IAiDocumentStorage {
  readonly configured: boolean;
  write(key: string, data: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export type AiJob =
  | { type: 'knowledge.reindex'; collection?: AiKnowledgeCollection; requestedBy?: string | null }
  | { type: 'conversation.summarize'; conversationId: string; uptoTurn: number }
  | { type: 'maintenance.purge' };

/** Background jobs (QStash). Without the queue, jobs run in-process. */
export const AI_QUEUE = 'AI_QUEUE';
export interface IAiQueue {
  readonly enabled: boolean;
  enqueue(job: AiJob, options?: { deduplicationId?: string; delaySeconds?: number }): Promise<void>;
  /** Checks the Upstash-Signature of a delivery. */
  verify(signature: string | undefined, rawBody: string): Promise<boolean>;
}
