import { Module } from '@nestjs/common';

import {
  MarketingController,
  MarketingQueueController,
  MarketingWorkerEventsController,
} from './application/controllers/marketing.controller';
import {
  KAGGLE_ACCOUNTS_REPOSITORY,
  KAGGLE_WORKER_POOL,
  MARKETING_AI,
  MARKETING_BRANDS_REPOSITORY,
  MARKETING_CAMPAIGNS_REPOSITORY,
  MARKETING_CATALOG,
  MARKETING_FILE_STORAGE,
  MARKETING_NOTIFIER,
  MARKETING_QUEUE,
  MARKETING_SCENES_REPOSITORY,
  RENDER_JOBS_REPOSITORY,
} from './application/ports';
import { MarketingCampaignsService } from './application/services/marketing-campaigns.service';
import { MarketingEvents } from './application/services/marketing-events';
import { MarketingPlannerService } from './application/services/marketing-planner.service';
import { MarketingQueueConsumer } from './application/services/marketing-queue.consumer';
import { MarketingRenderService } from './application/services/marketing-render.service';
import { MARKETING_STEP_RUNNER, MarketingScheduler } from './application/services/marketing-scheduler';
import { ByajBazaarAiAdapter } from './infrastructure/adapters/byajbazaar-ai.adapter';
import { ByajBazaarCatalogAdapter } from './infrastructure/adapters/byajbazaar-catalog.adapter';
import { ByajBazaarNotifierAdapter } from './infrastructure/adapters/byajbazaar-notifier.adapter';
import { loadMarketingSettings } from './infrastructure/config/marketing-settings.loader';
import { KaggleWorkerPool } from './infrastructure/kaggle/kaggle-worker-pool';
import { MarketingDatabase } from './infrastructure/persistence/marketing-database';
import {
  KaggleAccountsRepository,
  MarketingBrandsRepository,
  MarketingCampaignsRepository,
  MarketingScenesRepository,
  RenderJobsRepository,
} from './infrastructure/persistence/marketing.repositories';
import { QStashMarketingQueue } from './infrastructure/queue/qstash-marketing.queue';
import { MarketingFileStorage } from './infrastructure/storage/marketing-file.storage';
import { MarketingConfig } from './marketing.config';

/**
 * Marketing (experimental) — a self-contained bounded context:
 *  - own database (MARKETING_DB_*, own migrations table), own S3 bucket (MARKETING_S3_*), own queue (QStash);
 *  - depends on ByajBazaar only through the ports in application/ports, implemented by infrastructure/adapters
 *    (inventory + business name, WebSocket push, Cloudflare models) — the only files that import ByajBazaar code.
 *
 * Flow: input image → [queue: plan] 5 prompts (cheap text model) + 5 scene images (image-to-image) + brand logo
 * → [queue: dispatch] Kaggle notebook renders 5 × 5 s clips (+ logo clip once) and merges them, ending on the logo
 * → progress over the AWS WebSocket → clips + merged film in the marketing bucket.
 */
@Module({
  controllers: [MarketingController, MarketingWorkerEventsController, MarketingQueueController],
  providers: [
    {
      provide: MarketingConfig,
      useFactory: async (): Promise<MarketingConfig> => {
        await loadMarketingSettings();
        return new MarketingConfig();
      },
    },
    MarketingDatabase,
    { provide: MARKETING_CAMPAIGNS_REPOSITORY, useClass: MarketingCampaignsRepository },
    { provide: MARKETING_SCENES_REPOSITORY, useClass: MarketingScenesRepository },
    { provide: MARKETING_BRANDS_REPOSITORY, useClass: MarketingBrandsRepository },
    { provide: KAGGLE_ACCOUNTS_REPOSITORY, useClass: KaggleAccountsRepository },
    { provide: RENDER_JOBS_REPOSITORY, useClass: RenderJobsRepository },
    { provide: MARKETING_FILE_STORAGE, useClass: MarketingFileStorage },
    { provide: MARKETING_QUEUE, useClass: QStashMarketingQueue },
    { provide: KAGGLE_WORKER_POOL, useClass: KaggleWorkerPool },
    { provide: MARKETING_CATALOG, useClass: ByajBazaarCatalogAdapter },
    { provide: MARKETING_NOTIFIER, useClass: ByajBazaarNotifierAdapter },
    { provide: MARKETING_AI, useClass: ByajBazaarAiAdapter },
    MarketingEvents,
    MarketingScheduler,
    MarketingRenderService,
    MarketingPlannerService,
    MarketingCampaignsService,
    MarketingQueueConsumer,
    { provide: MARKETING_STEP_RUNNER, useExisting: MarketingQueueConsumer },
  ],
  exports: [MarketingRenderService, MarketingQueueConsumer, MarketingDatabase],
})
export class MarketingModule {}
