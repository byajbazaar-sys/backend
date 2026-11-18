import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { MarketingConfig } from '../../../marketing.config';
import { MarketingQueueMessage } from '../domain';
import { IMarketingQueue, MARKETING_QUEUE, IMarketingWorkerInvoker, MARKETING_WORKER_INVOKER } from '../ports';
import { MarketingStepRunner } from './marketing-step-runner';

export const MARKETING_STEP_RUNNER = 'MARKETING_STEP_RUNNER';

/**
 * Where a step runs:
 *  - with the queue configured: QStash → POST /marketing/queue (flow-controlled, retried);
 *  - long steps (plan / image / logo) are handed from the 29 s API request to the marketing worker Lambda;
 *  - without the queue (local dev): straight to the worker Lambda / in-process.
 */
@Injectable()
export class MarketingScheduler {
  constructor(
    private readonly config: MarketingConfig,
    private readonly moduleRef: ModuleRef,
    @Inject(MARKETING_QUEUE) private readonly queue: IMarketingQueue,
    @Inject(MARKETING_WORKER_INVOKER) private readonly worker: IMarketingWorkerInvoker,
    @InjectPinoLogger(MarketingScheduler.name) private readonly logger: PinoLogger,
  ) {}

  async schedule(
    message: MarketingQueueMessage,
    options?: { delaySeconds?: number; deduplicationId?: string },
  ): Promise<void> {
    if (this.queue.enabled) {
      try {
        await this.queue.enqueue(message, options);
        return;
      } catch (err) {
        this.logger.warn({ err, step: message.step }, 'Queue unavailable — running the step directly');
      }
    }
    if (options?.delaySeconds) return; // delayed re-checks only make sense with the queue
    await this.runInWorker(message);
  }

  /** Long steps run in the marketing worker Lambda (5 min timeout), not in an API request. */
  async runInWorker(message: MarketingQueueMessage): Promise<void> {
    if (this.config.workerLambdaName) {
      try {
        await this.worker.invoke(this.config.workerLambdaName, message);
        return;
      } catch (err) {
        this.logger.warn({ err, step: message.step }, 'Marketing worker Lambda invoke failed — running in-process');
      }
    }
    const runner = this.moduleRef.get<MarketingStepRunner>(MARKETING_STEP_RUNNER, { strict: false });
    void runner.run(message).catch((err) => this.logger.error({ err, message }, 'Marketing step failed'));
  }
}
