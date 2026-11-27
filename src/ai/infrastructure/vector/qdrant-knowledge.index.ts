import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AiConfig, AiKnowledgeCollection } from '../../ai.config';
import { AiKnowledgeChunk, AiKnowledgeHit, IAiKnowledgeIndex } from '../../application';

const physical = (collection: string, version: number): string => `${collection}__v${version}`;
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const VERSION_OF = /__v(\d+)$/;

/** Payload indexes: the tenant filter (scope) and the fields reindexing / filtering use. */
const PAYLOAD_INDEXES: { field: string; schema: 'keyword' | 'integer' }[] = [
  { field: 'scope', schema: 'keyword' },
  { field: 'docKey', schema: 'keyword' },
  { field: 'language', schema: 'keyword' },
  { field: 'tags', schema: 'keyword' },
];

/** Only chunks shared with every shop ('global') or owned by this shop are ever returned. */
export function scopeFilter(shopId: string): Record<string, unknown> {
  return { must: [{ key: 'scope', match: { any: ['global', shopId] } }] };
}

/**
 * Qdrant over its REST API (same client style as customer face search, same cluster unless AI_QDRANT_URL is set).
 * Each knowledge collection is an alias over versioned physical collections (`bb_help_documents__v3`): a reindex
 * fills the next version and swaps the alias in one atomic call, so searches never see a half-built index.
 */
@Injectable()
export class QdrantKnowledgeIndex implements IAiKnowledgeIndex {
  private readonly http: AxiosInstance | null;

  constructor(
    config: AiConfig,
    @InjectPinoLogger(QdrantKnowledgeIndex.name) private readonly logger: PinoLogger,
  ) {
    this.http = config.qdrant.url
      ? axios.create({
          baseURL: config.qdrant.url,
          timeout: config.qdrant.timeoutMs,
          headers: {
            'Content-Type': 'application/json',
            ...(config.qdrant.apiKey ? { 'api-key': config.qdrant.apiKey } : {}),
          },
          validateStatus: () => true,
        })
      : null;
  }

  get configured(): boolean {
    return this.http !== null;
  }

  async currentVersion(collection: AiKnowledgeCollection): Promise<number | null> {
    const res = await this.client().get<{ result?: { aliases?: { alias_name: string; collection_name: string }[] } }>(
      '/aliases',
    );
    this.check(res.status, 'list aliases');
    const target = res.data?.result?.aliases?.find((a) => a.alias_name === collection)?.collection_name;
    const match = target ? VERSION_OF.exec(target) : null;
    return match ? Number(match[1]) : null;
  }

  async createVersion(collection: AiKnowledgeCollection, dimension: number): Promise<number> {
    const existing = await this.physicalVersions(collection);
    const version = Math.max(0, ...existing, (await this.currentVersion(collection)) ?? 0) + 1;
    const name = physical(collection, version);
    const created = await this.client().put(`/collections/${name}`, {
      vectors: { size: dimension, distance: 'Cosine' },
      on_disk_payload: true,
    });
    this.check(created.status, `create ${name}`);
    for (const index of PAYLOAD_INDEXES) {
      const res = await this.client().put(`/collections/${name}/index?wait=true`, {
        field_name: index.field,
        field_schema: index.schema,
      });
      this.check(res.status, `index ${index.field} on ${name}`);
    }
    return version;
  }

  async upsert(
    collection: AiKnowledgeCollection,
    version: number,
    chunks: AiKnowledgeChunk[],
    vectors: number[][],
  ): Promise<void> {
    if (chunks.length !== vectors.length) throw new Error('Every chunk needs one vector');
    const name = physical(collection, version);
    for (let i = 0; i < chunks.length; i += 64) {
      const points = chunks.slice(i, i + 64).map((chunk, j) => ({
        id: chunk.id,
        vector: vectors[i + j],
        payload: {
          collection: chunk.collection,
          docKey: chunk.docKey,
          chunkIndex: chunk.chunkIndex,
          title: chunk.title,
          text: chunk.text,
          language: chunk.language,
          tags: chunk.tags,
          scope: chunk.scope,
          version,
        },
      }));
      const res = await this.client().put(`/collections/${name}/points?wait=true`, { points });
      this.check(res.status, `upsert into ${name}`);
    }
  }

  async promote(collection: AiKnowledgeCollection, version: number): Promise<void> {
    const name = physical(collection, version);
    const current = await this.currentVersion(collection);
    const actions: Record<string, unknown>[] = [];
    if (current !== null) actions.push({ delete_alias: { alias_name: collection } });
    actions.push({ create_alias: { collection_name: name, alias_name: collection } });
    const res = await this.client().post('/collections/aliases', { actions });
    this.check(res.status, `point ${collection} at ${name}`);
    // Older versions are no longer served.
    for (const old of await this.physicalVersions(collection)) {
      if (old === version) continue;
      const del = await this.client().delete(`/collections/${physical(collection, old)}`);
      if (del.status >= 300 && del.status !== 404)
        this.logger.warn({ collection, old, status: del.status }, 'Old knowledge version not removed');
    }
  }

  async search(
    collections: AiKnowledgeCollection[],
    vector: number[],
    options: { shopId: string; limit: number; minScore: number },
  ): Promise<AiKnowledgeHit[]> {
    const hits: AiKnowledgeHit[] = [];
    for (const collection of collections) {
      const res = await this.client().post<{
        result?: { id: string | number; score: number; payload?: Record<string, unknown> }[];
      }>(`/collections/${collection}/points/search`, {
        vector,
        limit: options.limit,
        with_payload: true,
        score_threshold: options.minScore,
        filter: scopeFilter(options.shopId),
      });
      if (res.status === 404) continue; // never indexed yet
      this.check(res.status, `search ${collection}`);
      for (const point of res.data?.result ?? []) {
        const p = point.payload ?? {};
        // Belt and braces: never return another shop's chunk even if the filter were misconfigured.
        if (p.scope !== 'global' && p.scope !== options.shopId) continue;
        hits.push({
          score: point.score,
          chunk: {
            id: String(point.id),
            collection,
            docKey: str(p.docKey),
            chunkIndex: Number(p.chunkIndex ?? 0),
            title: str(p.title),
            text: str(p.text),
            language: str(p.language),
            tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
            scope: String(p.scope),
          },
        });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, options.limit);
  }

  private async physicalVersions(collection: string): Promise<number[]> {
    const res = await this.client().get<{ result?: { collections?: { name: string }[] } }>('/collections');
    this.check(res.status, 'list collections');
    return (res.data?.result?.collections ?? [])
      .map((c) => c.name)
      .filter((name) => name.startsWith(`${collection}__v`))
      .map((name) => Number(VERSION_OF.exec(name)?.[1]))
      .filter((v) => Number.isFinite(v));
  }

  private client(): AxiosInstance {
    if (!this.http) throw new Error('No vector index is configured (AI_QDRANT_URL / QDRANT_URL).');
    return this.http;
  }

  private check(status: number, what: string): void {
    if (status < 200 || status >= 300) throw new Error(`Qdrant ${what} failed (${status})`);
  }
}
