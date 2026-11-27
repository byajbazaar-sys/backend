import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AI_KNOWLEDGE_COLLECTIONS, AiConfig, AiKnowledgeCollection } from '../../ai.config';
import { AiActor, AiKnowledgeDocument, EAiAuditEvent } from '../domain';
import { chunkText, contentHash, knowledgePointId } from '../knowledge/knowledge-chunks';
import { SEED_KNOWLEDGE } from '../knowledge/seed-knowledge';
import {
  AI_AUDIT_LOG,
  AI_DOCUMENT_STORAGE,
  AI_EMBEDDINGS,
  AI_KNOWLEDGE_DOCUMENTS_REPOSITORY,
  AI_KNOWLEDGE_INDEX,
  AiKnowledgeChunk,
  AiKnowledgeHit,
  IAiAuditLog,
  IAiDocumentStorage,
  IAiEmbeddings,
  IAiKnowledgeDocumentsRepository,
  IAiKnowledgeIndex,
} from '../ports';

const EMBED_BATCH = 16;
/** Largest knowledge document an admin can upload (characters). */
export const MAX_KNOWLEDGE_DOCUMENT_CHARS = 100_000;

export interface AiReindexResult {
  collection: AiKnowledgeCollection;
  version: number;
  documents: number;
  chunks: number;
}

/**
 * The knowledge layer (RAG): shared jewellery / trade / help knowledge in Qdrant, searched by meaning in any of the
 * three languages. Separate from business data on purpose — stock, dues and balances always come from the business
 * services, never from vectors.
 */
@Injectable()
export class AiKnowledgeService {
  constructor(
    private readonly config: AiConfig,
    @Inject(AI_EMBEDDINGS) private readonly embeddings: IAiEmbeddings,
    @Inject(AI_KNOWLEDGE_INDEX) private readonly index: IAiKnowledgeIndex,
    @Inject(AI_KNOWLEDGE_DOCUMENTS_REPOSITORY) private readonly documents: IAiKnowledgeDocumentsRepository,
    @Inject(AI_DOCUMENT_STORAGE) private readonly storage: IAiDocumentStorage,
    @Inject(AI_AUDIT_LOG) private readonly audit: IAiAuditLog,
    @InjectPinoLogger(AiKnowledgeService.name) private readonly logger: PinoLogger,
  ) {}

  /** Knowledge search is offered to the model only when a vector index is configured. */
  get available(): boolean {
    return this.index.configured;
  }

  async search(
    actor: AiActor,
    query: string,
    collections: AiKnowledgeCollection[] = [...AI_KNOWLEDGE_COLLECTIONS],
    limit = 4,
  ): Promise<AiKnowledgeHit[]> {
    const [vector] = await this.embeddings.embed([query.slice(0, 500)]);
    return this.index.search(collections, vector, {
      shopId: actor.shopId,
      limit,
      minScore: this.config.qdrant.minScore,
    });
  }

  /**
   * Full reindex of one collection (or all): builds a new collection version from the seed documents and the
   * uploaded ones, then swaps the alias to it — searches keep using the old version until the new one is complete.
   */
  async reindex(collection?: AiKnowledgeCollection, requestedBy?: string | null): Promise<AiReindexResult[]> {
    if (!this.index.configured) throw new Error('No vector index is configured (AI_QDRANT_URL / QDRANT_URL).');
    const targets = collection ? [collection] : [...AI_KNOWLEDGE_COLLECTIONS];
    const uploaded = (await this.documents.list()).filter((d) => d.source === 'upload');
    const results: AiReindexResult[] = [];
    for (const target of targets) {
      const docs = await this.sourceDocuments(target, uploaded);
      const chunks: AiKnowledgeChunk[] = docs.flatMap((doc) =>
        chunkText(doc.text).map((text, chunkIndex) => ({
          id: knowledgePointId(target, doc.docKey, chunkIndex),
          collection: target,
          docKey: doc.docKey,
          chunkIndex,
          title: doc.title,
          text,
          language: doc.language,
          tags: doc.tags,
          scope: doc.shopId ?? 'global',
        })),
      );
      const vectors: number[][] = [];
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const batch = chunks.slice(i, i + EMBED_BATCH);
        // The title goes in front so short chunks still carry their topic.
        vectors.push(...(await this.embeddings.embed(batch.map((c) => `${c.title}\n${c.text}`))));
      }
      const version = await this.index.createVersion(target, this.embeddings.dimension);
      if (chunks.length) await this.index.upsert(target, version, chunks, vectors);
      await this.index.promote(target, version);

      const counts = new Map<string, number>();
      for (const chunk of chunks) counts.set(chunk.docKey, (counts.get(chunk.docKey) ?? 0) + 1);
      const rows = await Promise.all(
        docs.map((doc) =>
          doc.id
            ? Promise.resolve({ id: doc.id, docKey: doc.docKey })
            : this.documents
                .upsert({
                  collection: target,
                  docKey: doc.docKey,
                  shopId: null,
                  title: doc.title,
                  language: doc.language,
                  source: 'seed',
                  storageKey: null,
                  contentHash: contentHash(doc.text),
                  chunkCount: 0,
                  indexedVersion: null,
                  indexedAt: null,
                  createdBy: null,
                })
                .then((row) => ({ id: row.id, docKey: row.docKey })),
        ),
      );
      await this.documents.markIndexed(
        rows.map((r) => r.id),
        version,
        new Map(rows.map((r) => [r.id, counts.get(r.docKey) ?? 0])),
        new Date(),
      );
      results.push({ collection: target, version, documents: docs.length, chunks: chunks.length });
      this.logger.info(
        { collection: target, version, documents: docs.length, chunks: chunks.length },
        'AI knowledge reindexed',
      );
    }
    await this.audit.record({
      event: EAiAuditEvent.KnowledgeReindexed,
      actorUserId: requestedBy ?? null,
      data: { results },
    });
    return results;
  }

  /** Stores an admin-written document in the AI bucket; it is searchable after the next reindex. */
  async addDocument(input: {
    collection: AiKnowledgeCollection;
    title: string;
    language: string;
    content: string;
    createdBy: string;
  }): Promise<AiKnowledgeDocument> {
    if (!this.storage.configured) throw new Error('No bucket is configured for AI documents (AI_S3_* / S3_*).');
    const text = input.content.trim().slice(0, MAX_KNOWLEDGE_DOCUMENT_CHARS);
    const docKey = `upload-${slug(input.title)}-${contentHash(text).slice(0, 10)}`;
    const storageKey = `${this.config.storagePrefix}knowledge/${input.collection}/${docKey}.md`;
    await this.storage.write(storageKey, Buffer.from(text, 'utf8'), 'text/markdown; charset=utf-8');
    return this.documents.upsert({
      collection: input.collection,
      docKey,
      shopId: null,
      title: input.title.trim().slice(0, 200),
      language: input.language,
      source: 'upload',
      storageKey,
      contentHash: contentHash(text),
      chunkCount: 0,
      indexedVersion: null,
      indexedAt: null,
      createdBy: input.createdBy,
    });
  }

  async removeDocument(id: string): Promise<boolean> {
    const doc = await this.documents.findById(id);
    if (doc?.source !== 'upload') return false;
    if (doc.storageKey) await this.storage.remove(doc.storageKey).catch(() => undefined);
    await this.documents.delete(id);
    return true;
  }

  async status(): Promise<{
    configured: boolean;
    versions: Record<string, number | null>;
    documents: AiKnowledgeDocument[];
  }> {
    const versions: Record<string, number | null> = {};
    if (this.index.configured) {
      for (const collection of AI_KNOWLEDGE_COLLECTIONS) {
        versions[collection] = await this.index.currentVersion(collection).catch(() => null);
      }
    }
    return { configured: this.index.configured, versions, documents: await this.documents.list() };
  }

  private async sourceDocuments(
    collection: AiKnowledgeCollection,
    uploaded: AiKnowledgeDocument[],
  ): Promise<
    {
      id?: string;
      docKey: string;
      title: string;
      language: string;
      tags: string[];
      text: string;
      shopId: string | null;
    }[]
  > {
    const known = new Map((await this.documents.list()).map((d) => [`${d.collection}:${d.docKey}`, d.id]));
    const out: {
      id?: string;
      docKey: string;
      title: string;
      language: string;
      tags: string[];
      text: string;
      shopId: string | null;
    }[] = SEED_KNOWLEDGE.filter((d) => d.collection === collection).map((d) => ({
      id: known.get(`${collection}:${d.docKey}`),
      docKey: d.docKey,
      title: d.title,
      language: d.language,
      tags: d.tags,
      text: d.text,
      shopId: null,
    }));
    for (const doc of uploaded.filter((d) => d.collection === collection && d.storageKey)) {
      try {
        const text = (await this.storage.read(doc.storageKey)).toString('utf8');
        out.push({
          id: doc.id,
          docKey: doc.docKey,
          title: doc.title,
          language: doc.language,
          tags: ['upload'],
          text,
          shopId: doc.shopId,
        });
      } catch (err) {
        this.logger.warn({ err, docKey: doc.docKey }, 'AI knowledge document could not be read; skipped');
      }
    }
    return out;
  }
}

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'doc';
