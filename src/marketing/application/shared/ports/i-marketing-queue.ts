import { MarketingQueueMessage } from '../domain';

/** Marketing job queue (Upstash QStash). Keeps Kaggle from being flooded: dispatches run one at a time. */
export const MARKETING_QUEUE = 'MARKETING_QUEUE';

export interface IMarketingQueue {
  readonly enabled: boolean;
  enqueue(message: MarketingQueueMessage, options?: { delaySeconds?: number; deduplicationId?: string }): Promise<void>;
  /** Verifies the Upstash-Signature header of an incoming delivery. */
  verify(signature: string | undefined, rawBody: string): Promise<boolean>;
}
