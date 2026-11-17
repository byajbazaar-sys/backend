import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { IMarketingQueue, MarketingQueueMessage } from '../../application/ports';
import { MarketingConfig } from '../../marketing.config';

/**
 * Upstash QStash queue. Messages are delivered to POST {MARKETING_API_BASE_URL}/api/v1/marketing/queue.
 * Flow control keeps one delivery per step running at a time, so Kaggle accounts are never flooded and
 * two dispatches can't race for the same worker slot.
 */
@Injectable()
export class QStashMarketingQueue implements IMarketingQueue {
  constructor(
    private readonly config: MarketingConfig,
    @InjectPinoLogger(QStashMarketingQueue.name) private readonly logger: PinoLogger,
  ) {}

  get enabled(): boolean {
    return this.config.queueEnabled;
  }

  private get destination(): string {
    return `${this.config.publicApiBaseUrl}/api/v1/marketing/queue`;
  }

  async enqueue(
    message: MarketingQueueMessage,
    options: { delaySeconds?: number; deduplicationId?: string } = {},
  ): Promise<void> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.queue.token}`,
      'Content-Type': 'application/json',
      'Upstash-Retries': '3',
      'Upstash-Flow-Control-Key': `byajbazaar-marketing-${message.step}`,
      // Kaggle dispatch runs strictly one at a time (no two dispatches racing for a slot).
      'Upstash-Flow-Control-Value': message.step === 'dispatch' ? 'parallelism=1' : 'parallelism=3',
    };
    if (options.delaySeconds) headers['Upstash-Delay'] = `${Math.round(options.delaySeconds)}s`;
    if (options.deduplicationId) headers['Upstash-Deduplication-Id'] = options.deduplicationId;

    const res = await axios.post(`${this.config.queue.url}/v2/publish/${this.destination}`, message, {
      headers,
      timeout: 15_000,
      validateStatus: () => true,
    });
    if (res.status >= 300) {
      this.logger.error({ status: res.status, body: res.data, step: message.step }, 'QStash publish failed');
      throw new Error(`QStash publish failed (${res.status})`);
    }
    this.logger.info(
      { step: message.step, campaignId: message.campaignId, delay: options.delaySeconds },
      'Marketing step queued',
    );
  }

  /** Upstash-Signature is an HS256 JWT signed with the current (or, during rotation, next) signing key. */
  verify(signature: string | undefined, rawBody: string): Promise<boolean> {
    if (!signature) return Promise.resolve(false);
    const keys = [this.config.queue.currentSigningKey, this.config.queue.nextSigningKey].filter(
      (key): key is string => !!key,
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
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
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
