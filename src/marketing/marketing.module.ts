import { Module } from '@nestjs/common';

import { MarketingAdminController } from './application/controllers/marketing-admin.controller';
import {
  MarketingInstagramCallbackController,
  MarketingInstagramController,
} from './application/controllers/marketing-instagram.controller';
import { MarketingPhotoshootController } from './application/controllers/marketing-photoshoot.controller';
import {
  MarketingController,
  MarketingQueueController,
  MarketingWorkerEventsController,
} from './application/controllers/marketing.controller';
import {
  IKaggleCredentialsRepository,
  IMarketingActivityLog,
  IMarketingCampaignsRepository,
  IMarketingPhotoshootsRepository,
  IRenderJobsRepository,
  KAGGLE_ACCOUNTS_REPOSITORY,
  KAGGLE_CREDENTIALS_REPOSITORY,
  KAGGLE_WORKER_POOL,
  MARKETING_ACTIVITY_LOG,
  MARKETING_AI,
  MARKETING_BRANDS_REPOSITORY,
  MARKETING_CAMPAIGNS_REPOSITORY,
  MARKETING_CATALOG,
  MARKETING_FILE_STORAGE,
  MARKETING_INSTAGRAM_REPOSITORY,
  MARKETING_NOTIFIER,
  MARKETING_QUEUE,
  MARKETING_PHOTOSHOOT_SHOTS_REPOSITORY,
  MARKETING_PHOTOSHOOTS_REPOSITORY,
  MARKETING_SCENES_REPOSITORY,
  MARKETING_SETTINGS_REPOSITORY,
  RENDER_JOBS_REPOSITORY,
} from './application/ports';
import { KaggleCredentialsAdminService } from './application/services/kaggle-credentials-admin.service';
import { MarketingCampaignsService } from './application/services/marketing-campaigns.service';
import { MarketingEvents } from './application/services/marketing-events';
import { MarketingInstagramService } from './application/services/marketing-instagram.service';
import { MarketingPhotoshootService } from './application/services/marketing-photoshoot.service';
import { MarketingPlannerService } from './application/services/marketing-planner.service';
import { MarketingQueueConsumer } from './application/services/marketing-queue.consumer';
import { MarketingRenderService } from './application/services/marketing-render.service';
import { MARKETING_STEP_RUNNER, MarketingScheduler } from './application/services/marketing-scheduler';
import { ByajBazaarActivityLogAdapter } from './infrastructure/adapters/byajbazaar-activity-log.adapter';
import { ByajBazaarAiAdapter } from './infrastructure/adapters/byajbazaar-ai.adapter';
import { ByajBazaarCatalogAdapter } from './infrastructure/adapters/byajbazaar-catalog.adapter';
import { ByajBazaarNotifierAdapter } from './infrastructure/adapters/byajbazaar-notifier.adapter';
import { loadMarketingSettings } from './infrastructure/config/marketing-settings.loader';
import { MarketingSecretCipher } from './infrastructure/crypto/marketing-secret.cipher';
import { KaggleWorkerPool } from './infrastructure/kaggle/kaggle-worker-pool';
import {
  campaignsWithActivityLog,
  kaggleCredentialsWithActivityLog,
  photoshootsWithActivityLog,
  renderJobsWithActivityLog,
} from './infrastructure/persistence/activity-logged.repositories';
import { MarketingDatabase } from './infrastructure/persistence/marketing-database';
import { MarketingInstagramRepository } from './infrastructure/persistence/marketing-instagram.repository';
import {
  MarketingPhotoshootShotsRepository,
  MarketingPhotoshootsRepository,
} from './infrastructure/persistence/marketing-photoshoot.repositories';
import {
  KaggleAccountsRepository,
  KaggleCredentialsRepository,
  MarketingBrandsRepository,
  MarketingCampaignsRepository,
  MarketingScenesRepository,
  MarketingSettingsRepository,
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
  controllers: [
    MarketingAdminController,
    MarketingInstagramController,
    MarketingInstagramCallbackController,
    MarketingPhotoshootController,
    MarketingController,
    MarketingWorkerEventsController,
    MarketingQueueController,
  ],
  providers: [
    {
      provide: MarketingConfig,
      useFactory: async (): Promise<MarketingConfig> => {
        await loadMarketingSettings();
        return new MarketingConfig();
      },
    },
    MarketingDatabase,
    // Campaign / photoshoot / render job / Kaggle account changes are also written to the activity log (logs service).
    { provide: MARKETING_ACTIVITY_LOG, useClass: ByajBazaarActivityLogAdapter },
    MarketingCampaignsRepository,
    MarketingPhotoshootsRepository,
    { provide: MARKETING_INSTAGRAM_REPOSITORY, useClass: MarketingInstagramRepository },
    KaggleCredentialsRepository,
    RenderJobsRepository,
    {
      provide: MARKETING_CAMPAIGNS_REPOSITORY,
      inject: [MarketingCampaignsRepository, MARKETING_ACTIVITY_LOG],
      useFactory: (repo: IMarketingCampaignsRepository, log: IMarketingActivityLog) =>
        campaignsWithActivityLog(repo, log),
    },
    { provide: MARKETING_SCENES_REPOSITORY, useClass: MarketingScenesRepository },
    {
      provide: MARKETING_PHOTOSHOOTS_REPOSITORY,
      inject: [MarketingPhotoshootsRepository, MARKETING_ACTIVITY_LOG],
      useFactory: (repo: IMarketingPhotoshootsRepository, log: IMarketingActivityLog) =>
        photoshootsWithActivityLog(repo, log),
    },
    { provide: MARKETING_PHOTOSHOOT_SHOTS_REPOSITORY, useClass: MarketingPhotoshootShotsRepository },
    { provide: MARKETING_BRANDS_REPOSITORY, useClass: MarketingBrandsRepository },
    { provide: KAGGLE_ACCOUNTS_REPOSITORY, useClass: KaggleAccountsRepository },
    { provide: MARKETING_SETTINGS_REPOSITORY, useClass: MarketingSettingsRepository },
    MarketingSecretCipher,
    {
      provide: KAGGLE_CREDENTIALS_REPOSITORY,
      inject: [KaggleCredentialsRepository, MARKETING_ACTIVITY_LOG],
      useFactory: (repo: IKaggleCredentialsRepository, log: IMarketingActivityLog) =>
        kaggleCredentialsWithActivityLog(repo, log),
    },
    {
      provide: RENDER_JOBS_REPOSITORY,
      inject: [RenderJobsRepository, MARKETING_ACTIVITY_LOG],
      useFactory: (repo: IRenderJobsRepository, log: IMarketingActivityLog) => renderJobsWithActivityLog(repo, log),
    },
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
    MarketingPhotoshootService,
    MarketingInstagramService,
    MarketingCampaignsService,
    KaggleCredentialsAdminService,
    MarketingQueueConsumer,
    { provide: MARKETING_STEP_RUNNER, useExisting: MarketingQueueConsumer },
  ],
  exports: [MarketingRenderService, MarketingQueueConsumer, MarketingDatabase],
})
export class MarketingModule {}
