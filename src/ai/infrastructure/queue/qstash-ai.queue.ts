import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AiConfig } from '../../ai.config';
import { AiJob, IAiQueue } from '../../application';

/**
 * Upstash QStash (the queue marketing already uses; AI_QSTASH_* or marketing's account). Deliveries go to
 * POST {AI_API_BASE_URL}/api/v1/ai/queue, retried by QStash, one reindex at a time.
 */
@Injectable()
export class QStashAiQueue implements IAiQueue {
  constructor(
    private readonly config: AiConfig,
    @InjectPinoLogger(QStashAiQueue.name) private readonly logger: PinoLogger,
  ) {}

  get enabled(): boolean {
    return this.config.queueEnabled;
  }

  private get destination(): string {
    return `${this.config.publicApiBaseUrl}/api/v1/ai/queue`;
  }

  async enqueue(job: AiJob, options: { deduplicationId?: string; delaySeconds?: number } = {}): Promise<void> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.queue.token}`,
      'Content-Type': 'application/json',
      'Upstash-Retries': '3',
      'Upstash-Flow-Control-Key': `byajbazaar-ai-${job.type}`,
      'Upstash-Flow-Control-Value': job.type === 'knowledge.reindex' ? 'parallelism=1' : 'parallelism=5',
    };
    if (options.delaySeconds) headers['Upstash-Delay'] = `${Math.round(options.delaySeconds)}s`;
    if (options.deduplicationId) headers['Upstash-Deduplication-Id'] = options.deduplicationId;
    const res = await axios.post(`${this.config.queue.url}/v2/publish/${this.destination}`, job, {
      headers,
      timeout: 10_000,
      validateStatus: () => true,
    });
    if (res.status >= 300) {
      this.logger.error({ status: res.status, type: job.type }, 'QStash publish failed');
      throw new Error(`QStash publish failed (${res.status})`);
    }
  }

  /** Upstash-Signature is an HS256 JWT signed with the current (or, during rotation, next) signing key. */
  verify(signature: string | undefined, rawBody: string): Promise<boolean> {
    if (!signature) return Promise.resolve(false);
    const keys = [this.config.queue.currentSigningKey, this.config.queue.nextSigningKey].filter(
      (k): k is string => !!k,
    );
    return Promise.resolve(keys.some((key) => this.verifyWithKey(signature, rawBody, key)));
  }

  private verifyWithKey(jwt: string, rawBody: string, key: string): boolean {
    const [header, payload, sig] = jwt.split('.');
    if (!header || !payload || !sig) return false;
    const expected = createHmac('sha256', key).update(`${header}.${payload}`).digest('base64url');
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    let claims: { iss?: string; sub?: string; exp?: number; nbf?: number; body?: string };
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as typeof claims;
    } catch {
      return false;
    }
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== 'Upstash') return false;
    if (claims.exp && now > claims.exp + 5) return false;
    if (claims.nbf && now + 5 < claims.nbf) return false;
    if (claims.sub && claims.sub !== this.destination) return false;
    const bodyHash = createHash('sha256').update(rawBody).digest('base64url');
    return (claims.body ?? '').replace(/=+$/, '') === bodyHash.replace(/=+$/, '');
  }
}
