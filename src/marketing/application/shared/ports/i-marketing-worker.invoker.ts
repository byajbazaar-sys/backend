import { MarketingQueueMessage } from '../domain';

/** Runs a marketing step in the marketing worker Lambda, in the background (does not wait for it). */
export const MARKETING_WORKER_INVOKER = 'MARKETING_WORKER_INVOKER';

export interface IMarketingWorkerInvoker {
  invoke(functionName: string, message: MarketingQueueMessage): Promise<void>;
}
