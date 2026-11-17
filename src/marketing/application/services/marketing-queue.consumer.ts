import { Injectable } from '@nestjs/common';

import { MarketingQueueMessage } from '../ports';
import { MarketingPhotoshootService } from './marketing-photoshoot.service';
import { MarketingPlannerService } from './marketing-planner.service';
import { MarketingRenderService } from './marketing-render.service';
import { MarketingScheduler, MarketingStepRunner } from './marketing-scheduler';

/** Routes queue deliveries. Long Kaggle AI steps run in the worker Lambda; queue dispatch runs here. */
@Injectable()
export class MarketingQueueConsumer implements MarketingStepRunner {
  constructor(
    private readonly planner: MarketingPlannerService,
    private readonly render: MarketingRenderService,
    private readonly photoshoots: MarketingPhotoshootService,
    private readonly scheduler: MarketingScheduler,
  ) {}

  /** Queue delivery (API request, 29 s budget). */
  async deliver(message: MarketingQueueMessage): Promise<void> {
    if (message.step === 'dispatch') {
      await this.render.dispatch();
      return;
    }
    if (message.step === 'watch') {
      if (message.renderJobId) await this.render.watch(message.renderJobId);
      return;
    }
    await this.scheduler.runInWorker(message);
  }

  /** Worker Lambda (5 min budget) / in-process fallback. */
  async run(message: MarketingQueueMessage): Promise<void> {
    switch (message.step) {
      case 'plan':
        if (message.campaignId) await this.planner.plan(message.campaignId);
        return;
      case 'image':
        if (message.campaignId && typeof message.sceneIndex === 'number') {
          await this.planner.regenerateImage(message.campaignId, message.sceneIndex, message.render !== false);
        }
        return;
      case 'logo':
        if (message.userId) await this.planner.regenerateLogo(message.userId, message.target ?? 'both');
        return;
      case 'dispatch':
        await this.render.dispatch();
        return;
      case 'watch':
        if (message.renderJobId) await this.render.watch(message.renderJobId);
        return;
      case 'photoshoot':
        if (message.photoshootId) await this.photoshoots.run(message.photoshootId, message.shotIndex);
        return;
    }
  }
}
