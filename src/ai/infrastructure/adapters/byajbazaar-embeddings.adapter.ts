import { Inject, Injectable } from '@nestjs/common';
import axios from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { CLOUDFLARE_ACCOUNT_POOL } from '../../../application';
import type { CloudflareAccountPool } from '../../../infrastructure/ai/services/cloudflare-account-pool.service';
import { AiConfig } from '../../ai.config';
import { IAiEmbeddings } from '../../application';

interface EmbeddingResponse {
  success?: boolean;
  result?: { data?: number[][]; response?: number[][] };
  errors?: { message?: string }[];
}

/**
 * Multilingual embeddings (bge-m3: English, Hindi, Hinglish) on Workers AI, through ByajBazaar's Cloudflare account
 * pool — the same rotation, quota cooldowns and usage log as try-on and marketing.
 */
@Injectable()
export class ByajBazaarWorkersAiEmbeddings implements IAiEmbeddings {
  constructor(
    private readonly config: AiConfig,
    @Inject(CLOUDFLARE_ACCOUNT_POOL) private readonly pool: CloudflareAccountPool,
    @InjectPinoLogger(ByajBazaarWorkersAiEmbeddings.name) private readonly logger: PinoLogger,
  ) {}

  get model(): string {
    return this.config.embeddings.model;
  }

  get dimension(): number {
    return this.config.embeddings.dimension;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const credentials = await this.pool.credentials();
    let lastError: unknown;
    for (const credential of credentials.slice(0, 3)) {
      const started = Date.now();
      try {
        const res = await axios.post<EmbeddingResponse>(
          `https://api.cloudflare.com/client/v4/accounts/${credential.accountId.trim()}/ai/run/${this.model}`,
          { text: texts },
          {
            headers: { Authorization: `Bearer ${credential.apiToken}`, 'Content-Type': 'application/json' },
            timeout: this.config.embeddings.timeoutMs,
            validateStatus: () => true,
          },
        );
        if (res.status < 200 || res.status >= 300 || res.data?.success === false) {
          const message = res.data?.errors?.[0]?.message || `Workers AI embeddings failed (${res.status})`;
          const quota = res.status === 429 && /neurons|daily free allocation|workers paid/i.test(message);
          this.pool.reportFailure(credential, {
            operation: 'embeddings',
            model: this.model,
            durationMs: Date.now() - started,
            status: res.status,
            message,
            quota,
          });
          lastError = new Error(message);
          continue;
        }
        const vectors = res.data?.result?.data ?? res.data?.result?.response ?? [];
        if (vectors.length !== texts.length || vectors.some((v) => v.length !== this.dimension)) {
          throw new Error(`Unexpected embedding shape from ${this.model}`);
        }
        this.pool.reportSuccess(credential, {
          operation: 'embeddings',
          model: this.model,
          durationMs: Date.now() - started,
        });
        return vectors;
      } catch (err) {
        lastError = err;
        this.logger.warn({ err: (err as Error).message, model: this.model }, 'Embedding attempt failed');
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Embeddings are unavailable');
  }
}
