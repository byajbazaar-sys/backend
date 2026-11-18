import { MarketingQueueMessage } from '../domain';

/** Runs a queued step (resolved lazily to avoid a construction cycle). */
export interface MarketingStepRunner {
  run(message: MarketingQueueMessage): Promise<void>;
}
