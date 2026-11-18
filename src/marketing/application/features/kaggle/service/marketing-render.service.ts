import { Inject, Injectable } from '@nestjs/common';
import { EAttachmentMimeType } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { KaggleHealthService } from './kaggle-health.service';
import { KaggleRecoveryResult } from './kaggle-recovery-result';
import { MarketingConfig } from '../../../../marketing.config';
import {
  MarketingCampaign,
  MarketingScene,
  RenderClipSpec,
  RenderJob,
  BUSY_RENDER_STATUSES,
  CAMPAIGN_SCENES,
  EAssetStatus,
  ECampaignStatus,
  EKaggleAccountStatus,
  ERenderJobKind,
  ERenderJobStatus,
  EPhotoshootStatus,
  PHOTOSHOOT_ASPECTS,
  PhotoshootAspect,
  IKaggleAccountsRepository,
  KAGGLE_ACCOUNTS_REPOSITORY,
  IKaggleWorkerPool,
  KAGGLE_WORKER_POOL,
  IMarketingActivityLog,
  MARKETING_ACTIVITY_LOG,
  IMarketingBrandsRepository,
  MARKETING_BRANDS_REPOSITORY,
  IMarketingCampaignsRepository,
  MARKETING_CAMPAIGNS_REPOSITORY,
  IMarketingFileStorage,
  MARKETING_FILE_STORAGE,
  IMarketingNotifier,
  MARKETING_NOTIFIER,
  IMarketingScenesRepository,
  MARKETING_SCENES_REPOSITORY,
  IMarketingPhotoshootsRepository,
  MARKETING_PHOTOSHOOTS_REPOSITORY,
  IMarketingPhotoshootShotsRepository,
  MARKETING_PHOTOSHOOT_SHOTS_REPOSITORY,
  IMarketingSettingsRepository,
  MARKETING_SETTINGS_REPOSITORY,
  IRenderJobsRepository,
  RENDER_JOBS_REPOSITORY,
  MarketingEvents,
  MarketingScheduler,
  LOGO_CLIP_KEY,
  MarketingKeys,
  sceneClipKey,
  sceneIndexFromClipKey,
} from '../../../shared';
import { buildLogoImagePrompt, buildSceneVideoPrompt, LOGO_VIDEO_PROMPT, VIDEO_NEGATIVE } from '../../campaigns';
import {
  isAccountCoolingDown,
  kaggleJobStatus,
  MIN_GPU_HOURS,
  STARTING_MAX_MS,
  buildImageWorkerNotebook,
  ImageNotebookJob,
  buildWorkerNotebook,
  NotebookClip,
  WorkerNotebookJob,
  signMarketingWorkerToken,
  verifyMarketingWorkerToken,
} from '../utils';
import { MarketingWorkerEvent } from './marketing-worker-event';

/** No progress for this long while on a worker → the Kaggle session died. */
const STALE_JOB_MS = 45 * 60 * 1000;
/** All slots busy → one delayed queue message (deduplicated per window), not DB polling. */
const RECHECK_DELAY_SECONDS = 120;
/** Retry a failed account setup after this long. */
const SETUP_RETRY_MS = 6 * 60 * 60 * 1000;
/** Automatic continuations per job (expired / crashed / hung Kaggle sessions). */
const MAX_RESTARTS = 4;
/** Watchdog interval for running jobs. */
const WATCH_INTERVAL_SECONDS = 15 * 60;
/** Kaggle says the session ended but no final event arrived after this long → it was cut off. */
const ENDED_GRACE_MS = 5 * 60 * 1000;
/** Kaggle says "running" but no progress for this long → the session hung. */
const HUNG_MS = 2 * 60 * 60 * 1000;
/** The notebook hands over this long before Kaggle's session limit. */
const SESSION_MARGIN_SECONDS = 20 * 60;
/** A ready account's cached GPU quota is re-checked with Kaggle after this long. */
const QUOTA_CACHE_MS = 10 * 60 * 1000;
/** An account that failed to start a notebook gets no new jobs for this long (its job goes to another account). */
const START_FAILURE_COOLDOWN_MS = 15 * 60 * 1000;
/** Auto-recover: a failed account setup is retried after this long (6 hours otherwise). */
const AUTO_SETUP_RETRY_MS = 30 * 60 * 1000;
/** Auto-recover: Kaggle kept the session queued (no GPU for the account) this long → move the job elsewhere. */
const KAGGLE_QUEUED_MAX_MS = 30 * 60 * 1000;
/** "Renders waiting but no account can take them" is logged/alerted at most this often (per server). */
const NO_CAPACITY_ALERT_MS = 30 * 60 * 1000;

/** A ready account that can take render jobs in this dispatch round. */
interface DispatchCandidate {
  username: string;
  concurrency: number;
  used: number;
  /** null = Kaggle reported no limit. */
  gpuHoursLeft: number | null;
  lastAssignedAt: number;
}

/**
 * Next account to give a job to: the one with the largest share of free slots (an idle account before a half-busy
 * one), then the most GPU hours left (spreads the weekly quota), then the one that waited longest (round robin).
 */
export function pickDispatchCandidate(candidates: DispatchCandidate[]): DispatchCandidate | null {
  let best: DispatchCandidate | null = null;
  const free = (c: DispatchCandidate): number => (c.concurrency - c.used) / c.concurrency;
  const hours = (c: DispatchCandidate): number => c.gpuHoursLeft ?? Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    if (c.used >= c.concurrency) continue;
    if (
      !best ||
      free(c) > free(best) ||
      (free(c) === free(best) && hours(c) > hours(best)) ||
      (free(c) === free(best) && hours(c) === hours(best) && c.lastAssignedAt < best.lastAssignedAt)
    ) {
      best = c;
    }
  }
  return best;
}

/** Photoshoot rows store statuses as plain strings. */
const isStatus = (value: string, status: EAssetStatus): boolean => value === String(status);

/** Scene images are rendered at the reel's 9:16 shape (upscaled to 1080×1920 by the video notebook). */
const SCENE_IMAGE_SIZE = { width: 720, height: 1280 };

type ImageTarget = NonNullable<RenderJob['payload']['imageGeneration']>['targets'][number];

function sceneImageTarget(campaign: MarketingCampaign, scene: MarketingScene): ImageTarget {
  return {
    index: scene.index,
    kind: 'scene',
    prompt: scene.imagePrompt,
    motionPrompt: scene.motionPrompt,
    outputKey: MarketingKeys.sceneImage(campaign.userId, campaign.id, scene.index),
    ...SCENE_IMAGE_SIZE,
  };
}

/** Image indexes a job still has to deliver. */
function unfinishedImageIndexes(job: RenderJob): Set<number> {
  const generation = job.payload.imageGeneration;
  const done = new Set(generation?.doneImages ?? []);
  return new Set((generation?.targets ?? []).filter((t) => !done.has(t.index)).map((t) => t.index));
}

@Injectable()
export class MarketingRenderService {
  constructor(
    private readonly config: MarketingConfig,
    @Inject(RENDER_JOBS_REPOSITORY) private readonly jobs: IRenderJobsRepository,
    @Inject(KAGGLE_ACCOUNTS_REPOSITORY) private readonly accounts: IKaggleAccountsRepository,
    @Inject(MARKETING_CAMPAIGNS_REPOSITORY) private readonly campaigns: IMarketingCampaignsRepository,
    @Inject(MARKETING_SCENES_REPOSITORY) private readonly scenes: IMarketingScenesRepository,
    @Inject(MARKETING_PHOTOSHOOTS_REPOSITORY) private readonly photoshoots: IMarketingPhotoshootsRepository,
    @Inject(MARKETING_PHOTOSHOOT_SHOTS_REPOSITORY)
    private readonly photoshootShots: IMarketingPhotoshootShotsRepository,
    @Inject(MARKETING_BRANDS_REPOSITORY) private readonly brands: IMarketingBrandsRepository,
    @Inject(MARKETING_FILE_STORAGE) private readonly storage: IMarketingFileStorage,
    @Inject(MARKETING_NOTIFIER) private readonly notifier: IMarketingNotifier,
    @Inject(KAGGLE_WORKER_POOL) private readonly pool: IKaggleWorkerPool,
    private readonly scheduler: MarketingScheduler,
    private readonly kaggleHealth: KaggleHealthService,
    private readonly events: MarketingEvents,
    @Inject(MARKETING_SETTINGS_REPOSITORY) private readonly settings: IMarketingSettingsRepository,
    @Inject(MARKETING_ACTIVITY_LOG) private readonly activity: IMarketingActivityLog,
    @InjectPinoLogger(MarketingRenderService.name) private readonly logger: PinoLogger,
  ) {}

  private lastNoCapacityAlert = 0;

  /** Kaggle health event for the admin activity log (logs service). Never throws. */
  private async healthEvent(action: string, entityId: string | null, data: Record<string, unknown>): Promise<void> {
    await this.activity
      .record({ action, entityType: entityId ? 'kaggle_account' : 'kaggle', entityId, data })
      .catch(() => undefined);
  }

  // ---------------------------------------------------------------- queueing renders

  /**
   * Queues scene images on the Kaggle image notebook. Scenes join the campaign's waiting image job when there is one;
   * while a notebook is already generating, the scenes it is not working on go to a follow-up job.
   */
  async queueCampaignImages(
    campaignId: string,
    sceneIndexes?: number[],
    renderAfter = true,
  ): Promise<RenderJob | null> {
    const campaign = await this.campaigns.findById(campaignId);
    if (!campaign) return null;
    const scenes = await this.scenes.listForCampaign(campaignId);
    let targets = scenes.filter((s) => sceneIndexes?.includes(s.index) ?? s.imageStatus !== EAssetStatus.Ready);
    const open = await this.jobs.findOpenFor({ campaignId, kind: ERenderJobKind.Images });
    if (open && open.status !== ERenderJobStatus.Waiting) {
      const inFlight = unfinishedImageIndexes(open);
      targets = targets.filter((s) => !inFlight.has(s.index));
    }
    if (!targets.length) return null;

    let job: RenderJob | null;
    if (open?.status === ERenderJobStatus.Waiting) {
      const existing = open.payload.imageGeneration;
      if (existing?.type !== 'campaign') return null;
      const known = new Set(existing.targets.map((t) => t.index));
      job = await this.jobs.update(open.id, {
        payload: {
          ...open.payload,
          imageGeneration: {
            ...existing,
            renderAfter: existing.renderAfter || renderAfter,
            targets: [
              ...existing.targets,
              ...targets.filter((s) => !known.has(s.index)).map((s) => sceneImageTarget(campaign, s)),
            ],
          },
        },
      });
    } else {
      job = await this.jobs.create({
        kind: ERenderJobKind.Images,
        userId: campaign.userId,
        campaignId,
        status: ERenderJobStatus.Waiting,
        payload: {
          clips: [],
          imageGeneration: {
            type: 'campaign',
            sourceImageKey: campaign.sourceImageKey,
            title: campaign.title,
            style: campaign.style,
            renderAfter,
            targets: targets.map((s) => sceneImageTarget(campaign, s)),
          },
        },
        progress: 0,
        attempts: 0,
      });
    }

    for (const scene of targets) {
      await this.scenes.update(scene.id, {
        imageStatus: EAssetStatus.Generating,
        videoStatus: EAssetStatus.Pending,
        error: null,
      });
    }
    await this.setCampaign(campaign, {
      status: ECampaignStatus.WaitingGpu,
      progress: Math.max(campaign.progress, 8),
      stageMessage: 'Waiting for Kaggle image generation',
      completedAt: null,
    });
    await this.scheduler.schedule({ step: 'dispatch' });
    return job;
  }

  /** Queues one or more AI photoshoot shots on the same Kaggle image-only notebook. */
  async queuePhotoshootImages(photoshootId: string, onlyIndex?: number): Promise<RenderJob | null> {
    const shoot = await this.photoshoots.findById(photoshootId);
    if (!shoot) return null;
    const allShots = await this.photoshootShots.listFor([shoot.id]);
    const selected = allShots.filter((s) =>
      typeof onlyIndex === 'number' ? s.index === onlyIndex : !isStatus(s.status, EAssetStatus.Ready),
    );
    if (!selected.length) return null;
    const open = await this.jobs.findOpenFor({ userId: shoot.userId, kind: ERenderJobKind.Images });
    if (open?.payload.imageGeneration?.photoshootId === shoot.id) return null;
    const size = PHOTOSHOOT_ASPECTS[shoot.aspect as PhotoshootAspect] ?? PHOTOSHOOT_ASPECTS['3:4'];
    const targets = selected.map((shot) => ({
      index: shot.index,
      kind: shot.kind,
      prompt: shot.prompt,
      outputKey: `photoshoots/${shoot.userId}/${shoot.id}/shot-${shot.index}-${Date.now()}.jpg`,
      width: size.width,
      height: size.height,
    }));
    const job = await this.jobs.create({
      kind: ERenderJobKind.Images,
      userId: shoot.userId,
      status: ERenderJobStatus.Waiting,
      payload: {
        clips: [],
        imageGeneration: {
          type: 'photoshoot',
          sourceImageKey: shoot.sourceImageKey,
          title: shoot.title,
          style: `${shoot.setting}; ${shoot.model}; ${shoot.outfit}`,
          photoshootId: shoot.id,
          targets,
        },
      },
      progress: 0,
      attempts: 0,
    });
    for (const shot of selected) {
      await this.photoshootShots.update(shot.id, { status: EAssetStatus.Generating, error: null });
    }
    await this.scheduler.schedule({ step: 'dispatch' });
    return job;
  }

  /** Generates the business logo with SDXL in the Kaggle image notebook. */
  async queueLogoImage(userId: string, businessName: string, renderVideo = false): Promise<RenderJob | null> {
    const open = await this.jobs.findOpenFor({ userId, kind: ERenderJobKind.Images });
    if (open?.payload.imageGeneration?.type === 'logo') {
      if (renderVideo && !open.payload.imageGeneration.renderAfter) {
        return this.jobs.update(open.id, {
          payload: {
            ...open.payload,
            imageGeneration: { ...open.payload.imageGeneration, renderAfter: true },
          },
        });
      }
      return open;
    }
    const brand = await this.brands.find(userId);
    if (!brand) return null;
    const outputKey = MarketingKeys.logoImage(userId);
    const job = await this.jobs.create({
      kind: ERenderJobKind.Images,
      userId,
      status: ERenderJobStatus.Waiting,
      payload: {
        clips: [],
        imageGeneration: {
          type: 'logo',
          title: businessName,
          renderAfter: renderVideo,
          targets: [
            {
              index: 0,
              kind: 'logo',
              prompt: buildLogoImagePrompt(businessName),
              outputKey,
              width: 720,
              height: 1280,
            },
          ],
        },
      },
      progress: 0,
      attempts: 0,
    });
    await this.brands.upsert({
      userId,
      logoImageStatus: EAssetStatus.Generating,
      error: null,
    });
    await this.events.brand(userId);
    await this.scheduler.schedule({ step: 'dispatch' });
    return job;
  }

  /**
   * Queues a Kaggle render for a campaign: the given scenes (default all with a ready image), the brand logo clip when
   * the brand has no logo video yet, and the merge. Joins an already-waiting job of the campaign instead of duplicating.
   */
  async queueCampaignRender(campaignId: string, sceneIndexes?: number[]): Promise<RenderJob | null> {
    const campaign = await this.campaigns.findById(campaignId);
    if (!campaign) return null;
    const scenes = await this.scenes.listForCampaign(campaignId);
    const wanted = scenes.filter(
      (s) => s.imageStatus === EAssetStatus.Ready && s.imageKey && (!sceneIndexes || sceneIndexes.includes(s.index)),
    );
    if (!wanted.length) return null;

    const clips: RenderClipSpec[] = wanted.map((s) => ({
      key: sceneClipKey(s.index),
      sceneId: s.id,
      imageKey: s.imageKey,
      prompt: buildSceneVideoPrompt(s.motionPrompt),
      outputKey: MarketingKeys.sceneVideo(campaign.userId, campaign.id, s.index),
    }));

    const brand = await this.brands.find(campaign.userId);
    const logoJob = await this.jobs.findOpenFor({ userId: campaign.userId, kind: ERenderJobKind.Logo });
    const needsLogo =
      !!brand?.logoImageKey &&
      brand.logoImageStatus === EAssetStatus.Ready &&
      brand.logoVideoStatus !== EAssetStatus.Ready &&
      !logoJob;
    if (needsLogo) {
      clips.push({
        key: LOGO_CLIP_KEY,
        imageKey: brand.logoImageKey,
        prompt: LOGO_VIDEO_PROMPT,
        outputKey: MarketingKeys.logoVideo(campaign.userId),
      });
    }
    const merge = {
      sceneKeys: Array.from({ length: CAMPAIGN_SCENES }, (_, i) => sceneClipKey(i)),
      outputKey: MarketingKeys.merged(campaign.userId, campaign.id),
    };

    const open = await this.jobs.findOpenFor({ campaignId, kind: ERenderJobKind.Campaign });
    let job: RenderJob | null;
    if (open?.status === ERenderJobStatus.Waiting) {
      const known = new Set(open.payload.clips.map((c) => c.key));
      job = await this.jobs.update(open.id, {
        payload: { clips: [...open.payload.clips, ...clips.filter((c) => !known.has(c.key))], merge },
      });
    } else if (open) {
      return null; // already rendering; the caller reports "busy"
    } else {
      job = await this.jobs.create({
        kind: ERenderJobKind.Campaign,
        userId: campaign.userId,
        campaignId,
        status: ERenderJobStatus.Waiting,
        payload: { clips, merge },
        progress: 0,
        attempts: 0,
      });
    }

    for (const s of wanted) await this.scenes.update(s.id, { videoStatus: EAssetStatus.Generating, error: null });
    if (needsLogo) await this.brands.upsert({ userId: campaign.userId, logoVideoStatus: EAssetStatus.Generating });
    await this.setCampaign(campaign, { status: ECampaignStatus.WaitingGpu, stageMessage: 'Waiting for a free GPU' });
    await this.scheduler.schedule({ step: 'dispatch' });
    return job;
  }

  /** Queues a render of only the brand logo clip (logo video regeneration). */
  async queueLogoRender(userId: string): Promise<RenderJob | null> {
    const brand = await this.brands.find(userId);
    if (!brand?.logoImageKey || brand.logoImageStatus !== EAssetStatus.Ready) return null;
    if (await this.jobs.findOpenFor({ userId, kind: ERenderJobKind.Logo })) return null;
    const job = await this.jobs.create({
      kind: ERenderJobKind.Logo,
      userId,
      status: ERenderJobStatus.Waiting,
      payload: {
        clips: [
          {
            key: LOGO_CLIP_KEY,
            imageKey: brand.logoImageKey,
            prompt: LOGO_VIDEO_PROMPT,
            outputKey: MarketingKeys.logoVideo(userId),
          },
        ],
        merge: null,
      },
      progress: 0,
      attempts: 0,
    });
    await this.brands.upsert({ userId, logoVideoStatus: EAssetStatus.Generating, error: null });
    await this.events.brand(userId);
    await this.scheduler.schedule({ step: 'dispatch' });
    return job;
  }

  // ---------------------------------------------------------------- dispatch

  /**
   * Sets up new Kaggle accounts and hands waiting jobs out across the ready accounts, one job at a time to the least
   * loaded one (pickDispatchCandidate), so parallel renders spread over every account. Runs one at a time (queue flow
   * control); a job an account fails to start goes to another account in the same round.
   */
  async dispatch(): Promise<void> {
    await this.failStaleJobs();
    await this.syncAccounts();

    const workers = new Map((await this.pool.workers()).map((w) => [w.id, w]));
    const busy = await this.jobs.countBusyByWorker();
    const accounts = (await this.accounts.list()).filter((a) => workers.has(a.username));

    // New accounts run their one-time setup notebook.
    for (const account of accounts) {
      if (account.status !== EKaggleAccountStatus.SettingUp) continue;
      if ((busy[account.username] ?? 0) >= workers.get(account.username).concurrency) continue;
      const job = await this.jobs.claimNext(account.username, false);
      if (!job) continue;
      busy[account.username] = (busy[account.username] ?? 0) + 1;
      await this.startJob(job, account.username, 0);
    }

    const candidates: DispatchCandidate[] = [];
    for (const account of accounts) {
      if (account.status !== EKaggleAccountStatus.Ready || isAccountCoolingDown(account)) continue;
      const concurrency = workers.get(account.username).concurrency;
      const used = busy[account.username] ?? 0;
      if (used >= concurrency) continue;
      const quota = await this.gpuQuota(account);
      if (!quota.usable) continue;
      candidates.push({
        username: account.username,
        concurrency,
        used,
        gpuHoursLeft: quota.hoursLeft,
        lastAssignedAt: account.lastAssignedAt ? new Date(account.lastAssignedAt).getTime() : 0,
      });
    }

    if (candidates.length === 0) await this.reportNoCapacity();

    let workLeft = true;
    for (;;) {
      const candidate = pickDispatchCandidate(candidates);
      if (!candidate) break;
      const job = await this.jobs.claimNext(candidate.username, true);
      if (!job) {
        workLeft = false;
        break;
      }
      candidate.used += 1;
      candidate.lastAssignedAt = Date.now();
      const slot = await this.freeSlot(candidate.username, candidate.concurrency);
      if (!(await this.startJob(job, candidate.username, slot))) candidate.used = candidate.concurrency;
    }

    if (workLeft && (await this.jobs.countWaiting()) > 0) {
      const window = Math.floor(Date.now() / (RECHECK_DELAY_SECONDS * 1000));
      await this.scheduler.schedule(
        { step: 'dispatch' },
        { delaySeconds: RECHECK_DELAY_SECONDS, deduplicationId: `marketing-dispatch-${window}` },
      );
    }
  }

  /**
   * Keeps kaggle_accounts in line with the enabled rows of kaggle_credentials. A new (or re-added) account is checked (credentials + GPU quota)
   * and gets a one-time SETUP notebook; it is used for renders only once that reports back READY.
   */
  async syncAccounts(): Promise<void> {
    const configured = await this.pool.workers();
    const setupRetryMs = (await this.settings.kaggle()).autoRecover ? AUTO_SETUP_RETRY_MS : SETUP_RETRY_MS;
    const known = new Map((await this.accounts.list()).map((a) => [a.username, a]));

    for (const worker of configured) {
      let account = known.get(worker.id);
      if (!account) {
        account = await this.accounts.upsert({
          username: worker.id,
          status: EKaggleAccountStatus.New,
          concurrency: worker.concurrency,
        });
        this.logger.info({ account: worker.id }, 'New Kaggle account found — setting it up');
      } else if (account.status === EKaggleAccountStatus.Disabled) {
        account = await this.accounts.upsert({
          username: worker.id,
          status: EKaggleAccountStatus.New,
          concurrency: worker.concurrency,
        });
      } else if (account.concurrency !== worker.concurrency) {
        await this.accounts.update(worker.id, { concurrency: worker.concurrency });
        account = { ...account, concurrency: worker.concurrency };
      }

      const retryFailed =
        account.status === EKaggleAccountStatus.Failed &&
        (!account.setupAttemptAt || Date.now() - new Date(account.setupAttemptAt).getTime() > setupRetryMs);
      if (account.status !== EKaggleAccountStatus.New && !retryFailed) continue;

      const claimed = await this.accounts.transition(
        worker.id,
        [EKaggleAccountStatus.New, EKaggleAccountStatus.Failed],
        {
          status: EKaggleAccountStatus.SettingUp,
          setupAttemptAt: new Date(),
          lastError: null,
        },
      );
      if (!claimed) continue;
      try {
        const quota = await this.pool.gpuQuota(worker.id);
        await this.accounts.update(worker.id, { gpuHoursLeft: quota.hoursLeft, quotaCheckedAt: new Date() });
        this.logger.info({ account: worker.id, gpuHoursLeft: quota.hoursLeft }, 'Kaggle credentials OK');
        await this.jobs.create({
          kind: ERenderJobKind.Setup,
          workerId: worker.id,
          status: ERenderJobStatus.Waiting,
          payload: { clips: [], merge: null },
          progress: 0,
          attempts: 0,
        });
      } catch (err) {
        await this.accounts.upsert({
          username: worker.id,
          status: EKaggleAccountStatus.Failed,
          lastError: (err as Error).message,
        });
        this.logger.warn({ account: worker.id, err: (err as Error).message }, 'Kaggle account setup failed');
        await this.healthEvent('KAGGLE_SETUP_FAILED', worker.id, { error: (err as Error).message });
      }
    }

    const listed = new Set(configured.map((w) => w.id));
    for (const account of known.values()) {
      if (!listed.has(account.username) && account.status !== EKaggleAccountStatus.Disabled) {
        await this.accounts.upsert({ username: account.username, status: EKaggleAccountStatus.Disabled });
      }
    }
  }

  /**
   * Renders are waiting but no account can take them: log why (CloudWatch) and tell admins (activity log), at most
   * every NO_CAPACITY_ALERT_MS per server so the 2-minute re-check does not flood either.
   */
  private async reportNoCapacity(): Promise<void> {
    if (Date.now() - this.lastNoCapacityAlert < NO_CAPACITY_ALERT_MS) return;
    const health = await this.kaggleHealth.report();
    if (health.waiting === 0) return;
    this.lastNoCapacityAlert = Date.now();
    const reasons = health.issues.filter((i) => i.level !== 'info').map((i) => i.message);
    this.logger.warn(
      { waiting: health.waiting, oldestWaitingMinutes: health.oldestWaitingMinutes, reasons },
      'Kaggle: renders are waiting but no account can take them',
    );
    await this.healthEvent('KAGGLE_NO_CAPACITY', null, {
      waiting: health.waiting,
      oldestWaitingMinutes: health.oldestWaitingMinutes,
      reasons,
    });
  }

  /**
   * "Restart Kaggle" (admin) — fixes what can be fixed without touching healthy renders: re-runs failed account
   * setups, ends cool-downs, moves renders whose Kaggle session ended, stayed queued or never started to another
   * account, then dispatches.
   */
  async recover(byAdmin = true): Promise<KaggleRecoveryResult> {
    const result: KaggleRecoveryResult = { setupsRestarted: [], cooldownsCleared: [], jobsRestarted: [] };
    const configured = new Set((await this.pool.workers()).map((w) => w.id));
    for (const account of await this.accounts.list()) {
      if (!configured.has(account.username)) continue;
      if (account.status === EKaggleAccountStatus.Failed) {
        const moved = await this.accounts.transition(account.username, [EKaggleAccountStatus.Failed], {
          status: EKaggleAccountStatus.New,
          lastError: null,
        });
        if (moved) result.setupsRestarted.push(account.username);
      } else if (isAccountCoolingDown(account)) {
        await this.accounts.update(account.username, { cooldownUntil: null });
        result.cooldownsCleared.push(account.username);
      }
    }
    for (const job of await this.jobs.listBusy()) {
      const reason = await this.stuckReason(job, 10 * 60 * 1000);
      if (!reason) continue;
      await this.restartJob(job, `${reason} (restarted by an admin)`, false, true);
      result.jobsRestarted.push({ id: job.id, account: job.workerId ?? null, reason });
    }
    this.logger.info({ ...result, byAdmin }, 'Kaggle recovery run');
    await this.healthEvent('KAGGLE_RECOVERY', null, { ...result, byAdmin });
    await this.scheduler.schedule({ step: 'dispatch' });
    return result;
  }

  /** Restarts one render job in a fresh Kaggle session (admin). Waiting jobs are just dispatched again. */
  async restartRenderJob(jobId: string): Promise<'restarted' | 'dispatched' | 'not-running'> {
    const job = await this.jobs.findById(jobId);
    if (!job) return 'not-running';
    if (job.status === ERenderJobStatus.Waiting) {
      await this.scheduler.schedule({ step: 'dispatch' });
      return 'dispatched';
    }
    if (!BUSY_RENDER_STATUSES.includes(job.status)) return 'not-running';
    await this.restartJob(job, 'Restarted by an admin', false, true);
    return 'restarted';
  }

  /** Why a busy job looks stuck (session ended / queued too long / never reported in), or null if it looks fine. */
  private async stuckReason(job: RenderJob, minSilentMs: number): Promise<string | null> {
    const silentMs = Date.now() - new Date(job.updatedAt ?? job.startedAt ?? Date.now()).getTime();
    if (silentMs < minSilentMs) return null;
    const kernelName = job.kernelRef?.split('/')[1];
    if (!job.workerId || !kernelName) return 'The GPU worker never started';
    const { state } = await this.pool.sessionStatus(job.workerId, kernelName);
    if (state === 'complete' || state === 'error' || state === 'cancelled') return `The Kaggle session ${state}`;
    if (state === 'queued') return 'Kaggle kept the session queued (no GPU free on the account)';
    if (job.status === ERenderJobStatus.Starting && state !== 'running') return 'The GPU worker never reported in';
    return null;
  }

  /**
   * GPU hours left on a ready account, from the cache when fresh (one Kaggle API call per account every
   * QUOTA_CACHE_MS instead of every dispatch). Accounts below MIN_GPU_HOURS, or whose check fails, sit this round out.
   */
  private async gpuQuota(account: {
    username: string;
    gpuHoursLeft?: number | null;
    quotaCheckedAt?: Date | null;
  }): Promise<{ usable: boolean; hoursLeft: number | null }> {
    let hoursLeft = account.gpuHoursLeft ?? null;
    const fresh = account.quotaCheckedAt && Date.now() - new Date(account.quotaCheckedAt).getTime() < QUOTA_CACHE_MS;
    if (!fresh) {
      try {
        hoursLeft = (await this.pool.gpuQuota(account.username)).hoursLeft;
        await this.accounts.update(account.username, { gpuHoursLeft: hoursLeft, quotaCheckedAt: new Date() });
      } catch (err) {
        this.logger.warn(
          { account: account.username, err: (err as Error).message },
          'Kaggle quota check failed — skipping this round',
        );
        return { usable: false, hoursLeft };
      }
    }
    if (hoursLeft !== null && hoursLeft < MIN_GPU_HOURS) {
      this.logger.info({ account: account.username, hoursLeft }, 'Kaggle GPU quota nearly used — skipping account');
      return { usable: false, hoursLeft };
    }
    return { usable: true, hoursLeft };
  }

  /** Lowest kernel slot (1…concurrency) not held by another busy job of the account. */
  private async freeSlot(username: string, concurrency: number): Promise<number> {
    const used = new Set(await this.jobs.busySlots(username));
    for (let slot = 1; slot <= concurrency; slot++) if (!used.has(slot)) return slot;
    return concurrency;
  }

  /** Pushes the job's notebook to the account. False when the account could not start it (job handed back). */
  private async startJob(job: RenderJob, workerId: string, slot: number): Promise<boolean> {
    let notebook: Record<string, unknown>;
    try {
      if (!this.config.websocketUrl) throw new Error('WEBSOCKET_API_URL is not configured');
      notebook =
        job.kind === ERenderJobKind.Images
          ? buildImageWorkerNotebook(await this.imageNotebookJob(job))
          : buildWorkerNotebook(await this.notebookJob(job));
    } catch (err) {
      // Our side (configuration, storage): no other account would do better.
      await this.failJob(job, `Could not start the GPU worker: ${(err as Error).message}`);
      return true;
    }
    const kernel =
      job.kind === ERenderJobKind.Setup
        ? { name: 'byajbazaar-account-setup', title: 'ByajBazaar Account Setup' }
        : job.kind === ERenderJobKind.Images
          ? { name: `byajbazaar-images-${slot}`, title: `ByajBazaar Images ${slot}` }
          : { name: `byajbazaar-render-${slot}`, title: `ByajBazaar Render ${slot}` };
    let pushed: { ref: string };
    try {
      pushed = await this.pool.pushNotebook(workerId, kernel, notebook);
    } catch (err) {
      const reason = (err as Error).message;
      if (job.kind === ERenderJobKind.Setup) {
        await this.failJob(job, `Could not start the GPU worker: ${reason}`);
        return false;
      }
      await this.accounts.update(workerId, {
        cooldownUntil: new Date(Date.now() + START_FAILURE_COOLDOWN_MS),
        lastError: `Could not start a notebook: ${reason}`.slice(0, 2000),
      });
      await this.healthEvent('KAGGLE_ACCOUNT_COOLDOWN', workerId, {
        reason,
        minutes: START_FAILURE_COOLDOWN_MS / 60_000,
        jobId: job.id,
      });
      await this.handBack(job, workerId, reason);
      return false;
    }
    const booting = job.attempts > 0 ? 'Continuing in a new GPU session' : 'GPU worker booting';
    const progress = Math.max(1, job.progress);
    await this.jobs.update(job.id, { kernelRef: pushed.ref, slot, stageMessage: booting, progress });
    if (job.kind !== ERenderJobKind.Setup) {
      await this.accounts.update(workerId, { lastAssignedAt: new Date(), lastError: null });
    }
    await this.reportJobProgress(
      job,
      progress,
      booting,
      job.kind === ERenderJobKind.Images ? ECampaignStatus.Planning : ECampaignStatus.Rendering,
      ERenderJobStatus.Starting,
    );
    await this.scheduleWatch(job.id);
    return true;
  }

  /**
   * An account could not start the job (Kaggle refused the push): it goes back to the queue for another account,
   * while that account cools down. Gives up after MAX_RESTARTS hand-backs/continuations.
   */
  private async handBack(job: RenderJob, workerId: string, reason: string): Promise<void> {
    this.logger.warn(
      { jobId: job.id, account: workerId, reason },
      'Kaggle account could not start the job — re-queued',
    );
    if (job.attempts >= MAX_RESTARTS) {
      await this.failJob({ ...job, workerId: null }, `Could not start the GPU worker: ${reason}`);
      return;
    }
    const message = 'Waiting for a free GPU';
    await this.jobs.update(job.id, {
      status: ERenderJobStatus.Waiting,
      workerId: null,
      slot: null,
      kernelRef: null,
      attempts: job.attempts + 1,
      stageMessage: message,
    });
    await this.reportJobProgress(
      { ...job, attempts: job.attempts + 1 },
      job.progress,
      message,
      ECampaignStatus.WaitingGpu,
      ERenderJobStatus.Waiting,
    );
  }

  private async notebookJob(job: RenderJob): Promise<WorkerNotebookJob> {
    const base = {
      jobId: job.id,
      token: signMarketingWorkerToken(job.id),
      wsUrl: this.config.websocketUrl,
      apiBaseUrl: this.config.publicApiBaseUrl,
    };
    if (job.kind === ERenderJobKind.Setup) return { ...base, kind: 'setup' };
    if (job.kind === ERenderJobKind.Images) throw new Error('Image jobs require the image notebook');

    const campaign = job.campaignId ? await this.campaigns.findById(job.campaignId) : null;
    // On a continuation, clips finished by an earlier session are skipped (they are merged from the bucket).
    const done = new Set(job.payload.done ?? []);
    const pending = job.payload.clips.filter((c) => !done.has(c.key));
    const clips: NotebookClip[] = await Promise.all(
      pending.map(async (c) => ({
        key: c.key,
        imageUrl: await this.storage.getUrlAsync(c.imageKey),
        prompt: c.prompt,
        negative: VIDEO_NEGATIVE,
        seed: -1,
        uploadUrl: await this.storage.generateUploadUrlAsync(c.outputKey, EAttachmentMimeType.VideoMp4),
      })),
    );

    let merge: WorkerNotebookJob['merge'] = null;
    if (job.payload.merge && !job.payload.mergeDone && campaign) {
      const rendering = new Set(pending.map((c) => c.key));
      const sources: Record<string, string> = {};
      for (const s of await this.scenes.listForCampaign(campaign.id)) {
        const key = sceneClipKey(s.index);
        if (!rendering.has(key) && s.videoStatus === EAssetStatus.Ready && s.videoKey) {
          sources[key] = await this.storage.getUrlAsync(s.videoKey);
        }
      }
      const brand = await this.brands.find(campaign.userId);
      const logoUrl =
        !rendering.has(LOGO_CLIP_KEY) && brand?.logoVideoStatus === EAssetStatus.Ready && brand.logoVideoKey
          ? await this.storage.getUrlAsync(brand.logoVideoKey)
          : undefined;
      merge = {
        order: job.payload.merge.sceneKeys,
        sources,
        logoKey: rendering.has(LOGO_CLIP_KEY) ? LOGO_CLIP_KEY : undefined,
        logoUrl,
        uploadUrl: await this.storage.generateUploadUrlAsync(job.payload.merge.outputKey, EAttachmentMimeType.VideoMp4),
      };
    }

    return {
      ...base,
      kind: 'render',
      preset: campaign?.quality === 'hd' ? 'reel_hq' : 'reel_fast',
      clips,
      merge,
      sessionBudgetSeconds: Math.max(3600, this.config.kaggleSessionHours * 3600 - SESSION_MARGIN_SECONDS),
    };
  }

  private async imageNotebookJob(job: RenderJob): Promise<ImageNotebookJob> {
    const generation = job.payload.imageGeneration;
    if (!generation) throw new Error('The image job payload is missing its generation details');
    const done = new Set(generation.doneImages ?? []);
    const sourceImageUrl = generation.sourceImageKey
      ? await this.storage.getUrlAsync(generation.sourceImageKey)
      : undefined;
    const targets = await Promise.all(
      generation.targets
        .filter((target) => !done.has(target.index))
        .map(async (target) => ({
          index: target.index,
          kind: target.kind,
          prompt: target.prompt,
          motionPrompt: target.motionPrompt,
          uploadUrl: await this.storage.generateUploadUrlAsync(target.outputKey, EAttachmentMimeType.ImageJpeg),
          width: target.width,
          height: target.height,
        })),
    );
    if (!targets.length) throw new Error('The image job has no unfinished images');
    return {
      jobId: job.id,
      token: signMarketingWorkerToken(job.id),
      wsUrl: this.config.websocketUrl,
      apiBaseUrl: this.config.publicApiBaseUrl,
      sourceImageUrl,
      type: generation.type,
      title: generation.title,
      style: generation.style,
      targets,
    };
  }

  // ---------------------------------------------------------------- notebook events

  isValidWorkerConnect(jobId?: string, token?: string): boolean {
    return !!jobId && verifyMarketingWorkerToken(jobId, token);
  }

  /** Progress from a Kaggle notebook. Returns false when the token is invalid. */
  async handleWorkerEvent(event: MarketingWorkerEvent): Promise<boolean> {
    if (!event.jobId || !verifyMarketingWorkerToken(event.jobId, event.token)) return false;
    const job = await this.jobs.findById(event.jobId);
    if (!job || !BUSY_RENDER_STATUSES.includes(job.status)) return true; // late or duplicate

    if (job.kind === ERenderJobKind.Setup) return this.handleSetupEvent(job, event);

    if (event.stage === 'sessionExpiring') {
      const progress = Math.max(job.progress ?? 0, Math.min(99, Math.round(Number(event.progress) || 0)));
      await this.restartJob({ ...job, progress }, 'The Kaggle session reached its time limit', true);
      return true;
    }

    if (job.kind === ERenderJobKind.Images) return this.handleImageWorkerEvent(job, event);

    if (event.status === 'failed') {
      await this.failJob(job, event.message || 'Rendering failed');
      await this.scheduler.schedule({ step: 'dispatch' });
      return true;
    }

    if (event.stage === 'clipDone' && event.clipKey) await this.clipDone(job, event.clipKey);
    if (event.stage === 'clipFailed' && event.clipKey) await this.clipFailed(job, event.clipKey, event.message);
    if (event.stage === 'mergeDone') await this.mergeDone(job);

    if (event.status === 'completed') {
      for (const key of event.failedClips ?? []) await this.clipFailed(job, key, 'Rendering failed');
      if (job.workerId) await this.accounts.recordOutcome(job.workerId, 'completed');
      await this.jobs.update(job.id, {
        status: ERenderJobStatus.Done,
        progress: 100,
        stageMessage: event.message || 'Done',
        finishedAt: new Date(),
      });
      await this.settleCampaign(job.campaignId);
      await this.scheduler.schedule({ step: 'dispatch' }); // free slot → next job
      return true;
    }

    const progress = Math.max(job.progress ?? 0, Math.min(99, Math.round(Number(event.progress) || 0)));
    await this.jobs.update(job.id, {
      status: ERenderJobStatus.Running,
      progress,
      stageMessage: (event.message || job.stageMessage || '').slice(0, 250),
    });
    await this.reportJobProgress(job, progress, event.message, ECampaignStatus.Rendering);
    return true;
  }

  private async handleImageWorkerEvent(job: RenderJob, event: MarketingWorkerEvent): Promise<boolean> {
    if (event.stage === 'imageDone' && typeof event.imageIndex === 'number') {
      await this.imageDone(job, event.imageIndex, event.imagePrompt, event.motionPrompt);
    } else if (event.stage === 'imageFailed' && typeof event.imageIndex === 'number') {
      await this.imageFailed(job, event.imageIndex, event.message || 'Image generation failed');
    }

    const progress = Math.max(job.progress ?? 0, Math.min(99, Math.round(Number(event.progress) || 0)));
    if (event.status === 'failed') {
      await this.failImageTargets(job, event.message || 'Image generation failed');
      await this.jobs.update(job.id, {
        status: ERenderJobStatus.Failed,
        error: (event.message || 'Image generation failed').slice(0, 2000),
        finishedAt: new Date(),
      });
      if (job.workerId) await this.accounts.recordOutcome(job.workerId, 'failed');
      await this.finishImageJob(job, false);
      await this.scheduler.schedule({ step: 'dispatch' });
      return true;
    }

    if (event.status === 'completed') {
      for (const index of event.failedImages ?? []) {
        await this.imageFailed(job, index, 'Image generation failed');
      }
      await this.failImageTargets(job, 'The image worker finished without returning this image');
      if (job.workerId) await this.accounts.recordOutcome(job.workerId, 'completed');
      await this.jobs.update(job.id, {
        status: ERenderJobStatus.Done,
        progress: 100,
        stageMessage: event.message || 'Images ready',
        finishedAt: new Date(),
      });
      await this.finishImageJob(job, true);
      await this.scheduler.schedule({ step: 'dispatch' });
      return true;
    }

    await this.jobs.update(job.id, {
      status: ERenderJobStatus.Running,
      progress,
      stageMessage: (event.message || job.stageMessage || 'Generating images').slice(0, 250),
    });
    await this.reportJobProgress(job, progress, event.message, ECampaignStatus.Planning);
    return true;
  }

  private async imageDone(job: RenderJob, index: number, imagePrompt?: string, motionPrompt?: string): Promise<void> {
    const generation = job.payload.imageGeneration;
    const target = generation?.targets.find((item) => item.index === index);
    if (!generation || !target || !(await this.storage.existsAsync(target.outputKey))) {
      await this.imageFailed(job, index, 'The worker reported an image but its upload is missing');
      return;
    }
    if (generation.type === 'campaign' && job.campaignId) {
      const scene = await this.scenes.findByIndex(job.campaignId, index);
      if (!scene) return;
      await this.scenes.update(scene.id, {
        imageKey: target.outputKey,
        imagePrompt: imagePrompt?.slice(0, 4000) || scene.imagePrompt,
        motionPrompt: motionPrompt?.slice(0, 2000) || scene.motionPrompt,
        imageStatus: EAssetStatus.Ready,
        error: null,
      });
      const campaign = await this.campaigns.findById(job.campaignId);
      if (campaign) await this.events.campaign(campaign, true);
    } else if (generation.photoshootId) {
      const shots = await this.photoshootShots.listFor([generation.photoshootId]);
      const shot = shots.find((item) => item.index === index);
      if (shot) {
        if (shot.imageKey && shot.imageKey !== target.outputKey) await this.removeQuietly(shot.imageKey);
        await this.photoshootShots.update(shot.id, {
          imageKey: target.outputKey,
          prompt: imagePrompt?.slice(0, 4000) || shot.prompt,
          status: EAssetStatus.Ready,
          error: null,
        });
        await this.notifyPhotoshoot(generation.photoshootId);
      }
    } else if (generation.type === 'logo' && job.userId) {
      const brand = await this.brands.find(job.userId);
      if (brand?.logoImageKey && brand.logoImageKey !== target.outputKey) {
        await this.removeQuietly(brand.logoImageKey);
      }
      await this.brands.upsert({
        userId: job.userId,
        logoImageKey: target.outputKey,
        logoImageStatus: EAssetStatus.Ready,
        logoVideoStatus: brand?.logoVideoKey ? EAssetStatus.Pending : brand?.logoVideoStatus,
        error: null,
      });
      await this.events.brand(job.userId);
    }
    const fresh = await this.jobs.findById(job.id);
    const done = new Set(fresh?.payload.imageGeneration?.doneImages ?? generation.doneImages ?? []);
    done.add(index);
    await this.jobs.update(job.id, {
      payload: {
        ...(fresh ?? job).payload,
        imageGeneration: { ...generation, doneImages: [...done] },
      },
    });
  }

  private async imageFailed(job: RenderJob, index: number, message: string): Promise<void> {
    const generation = job.payload.imageGeneration;
    const target = generation?.targets.find((item) => item.index === index);
    if (!generation || !target) return;
    if (generation.type === 'campaign' && job.campaignId) {
      const scene = await this.scenes.findByIndex(job.campaignId, index);
      if (scene?.imageStatus === EAssetStatus.Generating) {
        await this.scenes.update(scene.id, { imageStatus: EAssetStatus.Failed, error: message.slice(0, 500) });
        const campaign = await this.campaigns.findById(job.campaignId);
        if (campaign) await this.events.campaign(campaign, true);
      }
    } else if (generation.photoshootId) {
      const shots = await this.photoshootShots.listFor([generation.photoshootId]);
      const shot = shots.find((item) => item.index === index);
      if (shot && isStatus(shot.status, EAssetStatus.Generating)) {
        await this.photoshootShots.update(shot.id, {
          status: EAssetStatus.Failed,
          error: message.slice(0, 500),
        });
        await this.notifyPhotoshoot(generation.photoshootId);
      }
    } else if (generation.type === 'logo' && job.userId) {
      await this.brands.upsert({
        userId: job.userId,
        logoImageStatus: EAssetStatus.Failed,
        error: message.slice(0, 500),
      });
      await this.events.brand(job.userId);
    }
  }

  private async failImageTargets(job: RenderJob, message: string): Promise<void> {
    const generation = job.payload.imageGeneration;
    if (!generation) return;
    const done = new Set(generation.doneImages ?? []);
    for (const target of generation.targets) {
      if (done.has(target.index)) continue;
      if (await this.storage.existsAsync(target.outputKey)) {
        await this.imageDone(job, target.index);
      } else {
        await this.imageFailed(job, target.index, message);
      }
    }
  }

  private async finishImageJob(job: RenderJob, success: boolean): Promise<void> {
    const generation = job.payload.imageGeneration;
    if (!generation) return;
    if (generation.type === 'campaign' && job.campaignId) {
      const campaign = await this.campaigns.findById(job.campaignId);
      if (!campaign) return;
      const scenes = await this.scenes.listForCampaign(job.campaignId);
      const ready = scenes.filter((scene) => scene.imageStatus === EAssetStatus.Ready);
      if (ready.length && generation.renderAfter) {
        await this.renderCampaignImages(generation, job.campaignId);
      } else if (!ready.length || !success) {
        await this.setCampaign(campaign, {
          status: campaign.mergedVideoKey ? ECampaignStatus.Partial : ECampaignStatus.Failed,
          stageMessage: ready.length ? 'Some images failed — try again' : 'Image generation failed',
          error: ready.length ? 'Some scene images could not be generated' : 'No scene images could be generated',
        });
      } else {
        await this.setCampaign(campaign, {
          status: campaign.mergedVideoKey ? ECampaignStatus.Partial : ECampaignStatus.Failed,
          stageMessage: 'Scene images ready',
          error: null,
        });
      }
    } else if (generation.photoshootId) {
      const shots = await this.photoshootShots.listFor([generation.photoshootId]);
      const ready = shots.filter((shot) => isStatus(shot.status, EAssetStatus.Ready)).length;
      const status =
        ready === shots.length
          ? EPhotoshootStatus.Ready
          : ready > 0
            ? EPhotoshootStatus.Partial
            : EPhotoshootStatus.Failed;
      await this.photoshoots.update(generation.photoshootId, {
        status,
        error: status === EPhotoshootStatus.Ready ? null : (shots.find((shot) => shot.error)?.error ?? null),
      });
      await this.notifyPhotoshoot(generation.photoshootId);
    } else if (generation.type === 'logo' && job.userId) {
      if (generation.renderAfter) await this.queueLogoRender(job.userId);
      await this.events.brand(job.userId);
      await this.continueCampaignsAfterLogo(job.userId);
    }
  }

  private async renderCampaignImages(
    generation: NonNullable<RenderJob['payload']['imageGeneration']>,
    campaignId: string,
  ): Promise<void> {
    const campaign = await this.campaigns.findById(campaignId);
    if (!campaign) return;
    const brand = await this.brands.find(campaign.userId);
    if (brand?.logoImageStatus === EAssetStatus.Generating) {
      await this.setCampaign(campaign, {
        status: ECampaignStatus.WaitingGpu,
        stageMessage: 'Waiting for brand logo generation',
      });
      return;
    }
    const ready = (await this.scenes.listForCampaign(campaignId))
      .filter((scene) => scene.imageStatus === EAssetStatus.Ready && scene.videoStatus !== EAssetStatus.Ready)
      .map((scene) => scene.index);
    const queueIndexes = generation.targets.map((target) => target.index);
    for (const index of ready) if (!queueIndexes.includes(index)) queueIndexes.push(index);
    if (queueIndexes.length) await this.queueCampaignRender(campaignId, queueIndexes);
  }

  private async continueCampaignsAfterLogo(userId: string): Promise<void> {
    const campaigns = await this.campaigns.listForUser(userId, 30);
    for (const campaign of campaigns) {
      if (campaign.status !== ECampaignStatus.Planning && campaign.status !== ECampaignStatus.WaitingGpu) continue;
      const scenes = await this.scenes.listForCampaign(campaign.id);
      if (scenes.some((scene) => scene.imageStatus !== EAssetStatus.Ready)) continue;
      const unfinished = scenes.filter((scene) => scene.videoStatus !== EAssetStatus.Ready).map((scene) => scene.index);
      if (unfinished.length) await this.queueCampaignRender(campaign.id, unfinished);
    }
  }

  private async notifyPhotoshoot(photoshootId: string): Promise<void> {
    const shoot = await this.photoshoots.findById(photoshootId);
    if (!shoot) return;
    await this.notifier.notifyUser(shoot.userId, {
      type: 'marketingPhotoshootUpdated',
      photoshoot: { id: shoot.id, status: shoot.status },
      refresh: true,
      timestamp: new Date().toISOString(),
    });
  }

  private async handleSetupEvent(job: RenderJob, event: MarketingWorkerEvent): Promise<boolean> {
    if (event.status === 'completed') {
      await this.jobs.update(job.id, { status: ERenderJobStatus.Done, progress: 100, finishedAt: new Date() });
      await this.accounts.upsert({
        username: job.workerId,
        status: EKaggleAccountStatus.Ready,
        readyAt: new Date(),
        gpuInfo: event.gpuInfo?.slice(0, 250) ?? null,
        lastError: null,
      });
      this.logger.info({ account: job.workerId, gpu: event.gpuInfo }, 'Kaggle account ready');
      await this.scheduler.schedule({ step: 'dispatch' }); // start using it
    } else if (event.status === 'failed') {
      await this.failJob(job, event.message || 'Account setup failed');
    } else {
      await this.jobs.update(job.id, { status: ERenderJobStatus.Running, progress: Number(event.progress) || 0 });
    }
    return true;
  }

  private clipSpec(job: RenderJob, key: string): RenderClipSpec | undefined {
    return job.payload.clips.find((c) => c.key === key);
  }

  private async clipDone(job: RenderJob, key: string): Promise<void> {
    const spec = this.clipSpec(job, key);
    if (!spec || !(await this.storage.existsAsync(spec.outputKey))) {
      await this.clipFailed(job, key, 'The worker reported the clip but the upload is missing');
      return;
    }
    // Remember it, so a continuation in a new session doesn't render it again.
    const fresh = await this.jobs.findById(job.id);
    const done = new Set(fresh?.payload.done ?? []);
    done.add(key);
    await this.jobs.update(job.id, { payload: { ...(fresh ?? job).payload, done: [...done] } });
    if (key === LOGO_CLIP_KEY && job.userId) {
      const brand = await this.brands.find(job.userId);
      if (brand?.logoVideoKey && brand.logoVideoKey !== spec.outputKey) await this.removeQuietly(brand.logoVideoKey);
      await this.brands.upsert({
        userId: job.userId,
        logoVideoKey: spec.outputKey,
        logoVideoStatus: EAssetStatus.Ready,
        error: null,
      });
      await this.events.brand(job.userId);
      return;
    }
    const index = sceneIndexFromClipKey(key);
    if (index === null || !job.campaignId) return;
    const scene = await this.scenes.findByIndex(job.campaignId, index);
    if (!scene) return;
    if (scene.videoKey && scene.videoKey !== spec.outputKey) await this.removeQuietly(scene.videoKey);
    await this.scenes.update(scene.id, { videoKey: spec.outputKey, videoStatus: EAssetStatus.Ready, error: null });
    const campaign = await this.campaigns.findById(job.campaignId);
    if (campaign) await this.events.campaign(campaign, true);
  }

  private async clipFailed(job: RenderJob, key: string, message?: string): Promise<void> {
    if (key === LOGO_CLIP_KEY && job.userId) {
      const brand = await this.brands.find(job.userId);
      if (brand?.logoVideoStatus !== EAssetStatus.Generating) return;
      await this.brands.upsert({ userId: job.userId, logoVideoStatus: EAssetStatus.Failed, error: message ?? null });
      await this.events.brand(job.userId);
      return;
    }
    const index = sceneIndexFromClipKey(key);
    if (index === null || !job.campaignId) return;
    const scene = await this.scenes.findByIndex(job.campaignId, index);
    // Only scenes this job was still making; keeps the first (most specific) error message.
    if (scene?.videoStatus === EAssetStatus.Generating) {
      await this.scenes.update(scene.id, { videoStatus: EAssetStatus.Failed, error: message?.slice(0, 500) ?? null });
      // Show the failed scene right away (not only when the whole campaign settles).
      const campaign = await this.campaigns.findById(job.campaignId);
      if (campaign) await this.events.campaign(campaign, true);
    }
  }

  private async mergeDone(job: RenderJob): Promise<void> {
    const outputKey = job.payload.merge?.outputKey;
    if (!outputKey || !job.campaignId || !(await this.storage.existsAsync(outputKey))) return;
    const campaign = await this.campaigns.findById(job.campaignId);
    if (!campaign) return;
    if (campaign.mergedVideoKey && campaign.mergedVideoKey !== outputKey)
      await this.removeQuietly(campaign.mergedVideoKey);
    await this.setCampaign(campaign, { mergedVideoKey: outputKey });
    const fresh = await this.jobs.findById(job.id);
    if (fresh) await this.jobs.update(job.id, { payload: { ...fresh.payload, mergeDone: true } });
  }

  // ---------------------------------------------------------------- failures & campaign state

  /** Busy jobs with no progress for a while: continue them in a new session (or fail once out of restarts). */
  private async failStaleJobs(): Promise<void> {
    const stale = await this.jobs.findStale(BUSY_RENDER_STATUSES, new Date(Date.now() - STALE_JOB_MS));
    for (const job of stale) await this.restartJob(job, 'The GPU worker stopped responding');
  }

  // ---------------------------------------------------------------- session restarts

  private async scheduleWatch(jobId: string, delaySeconds = WATCH_INTERVAL_SECONDS): Promise<void> {
    const window = Math.floor(Date.now() / (delaySeconds * 1000));
    await this.scheduler.schedule(
      { step: 'watch', renderJobId: jobId },
      { delaySeconds, deduplicationId: `marketing-watch-${jobId}-${window}` },
    );
  }

  /**
   * Watchdog for a running job: asks Kaggle for the session state and restarts the job in a new session when the
   * session ended without finishing (time limit, crash, cancelled) or is stuck. Re-arms itself while the job runs.
   */
  async watch(jobId: string): Promise<void> {
    const job = await this.jobs.findById(jobId);
    if (!job || !BUSY_RENDER_STATUSES.includes(job.status)) return;
    const silentMs = Date.now() - new Date(job.updatedAt ?? job.startedAt ?? Date.now()).getTime();
    const kernelName = job.kernelRef?.split('/')[1];
    const { state, failureMessage } =
      job.workerId && kernelName
        ? await this.pool.sessionStatus(job.workerId, kernelName)
        : { state: 'unknown' as const, failureMessage: undefined };

    const ended = state === 'complete' || state === 'error' || state === 'cancelled';
    if (ended && silentMs > ENDED_GRACE_MS) {
      const why =
        state === 'error'
          ? `The Kaggle session stopped with an error${failureMessage ? `: ${failureMessage}` : ''}`
          : state === 'cancelled'
            ? 'The Kaggle session was cancelled'
            : 'The Kaggle session ended before finishing';
      await this.restartJob(job, why);
      return;
    }
    if ((await this.settings.kaggle()).autoRecover) {
      if (state === 'queued' && silentMs > KAGGLE_QUEUED_MAX_MS && job.workerId) {
        // The account gets no GPU from Kaggle right now: rest it and render elsewhere.
        await this.accounts.update(job.workerId, {
          cooldownUntil: new Date(Date.now() + START_FAILURE_COOLDOWN_MS),
          lastError: 'Kaggle kept the session queued (no GPU free on the account)',
        });
        await this.restartJob(job, 'Kaggle kept the session queued for too long');
        return;
      }
      if (job.status === ERenderJobStatus.Starting && state !== 'running' && silentMs > STARTING_MAX_MS) {
        await this.restartJob(job, 'The GPU worker never reported in');
        return;
      }
    }
    const hung = state === 'running' && silentMs > HUNG_MS;
    const silent = state !== 'running' && state !== 'queued' && silentMs > STALE_JOB_MS;
    if (hung || silent) {
      await this.restartJob(job, 'The GPU worker stopped responding');
      return;
    }
    await this.scheduleWatch(job.id, ended ? ENDED_GRACE_MS / 1000 : WATCH_INTERVAL_SECONDS);
  }

  /**
   * Continues a job in a fresh Kaggle session (any free account): finished clips are kept and skipped. Gives up after
   * MAX_RESTARTS. Account setup jobs are not continued — they fail and are retried by the account sync.
   */
  private async restartJob(job: RenderJob, reason: string, planned = false, force = false): Promise<void> {
    if (!planned) {
      await this.healthEvent('KAGGLE_JOB_RESTARTED', job.workerId ?? null, {
        jobId: job.id,
        kind: job.kind,
        reason,
        attempt: job.attempts + 1,
        byAdmin: force,
      });
    }
    if (job.kind === ERenderJobKind.Setup) {
      await this.failJob(job, reason);
      return;
    }
    if (job.attempts >= MAX_RESTARTS && !force) {
      await this.failJob(job, `${reason} (gave up after ${job.attempts} restarts)`);
      await this.scheduler.schedule({ step: 'dispatch' });
      return;
    }
    const message = `${reason} — continuing in a new session`;
    this.logger.warn(
      { jobId: job.id, worker: job.workerId, attempt: job.attempts + 1, reason, planned },
      'Restarting render job',
    );
    await this.jobs.update(job.id, {
      status: ERenderJobStatus.Waiting,
      workerId: null,
      slot: null,
      kernelRef: null,
      attempts: job.attempts + 1,
      progress: job.progress,
      stageMessage: message,
    });
    await this.reportJobProgress(
      { ...job, attempts: job.attempts + 1 },
      job.progress,
      message,
      ECampaignStatus.WaitingGpu,
      ERenderJobStatus.Waiting,
    );
    await this.scheduler.schedule({ step: 'dispatch' });
  }

  private async failJob(job: RenderJob, message: string): Promise<void> {
    this.logger.warn({ jobId: job.id, kind: job.kind, worker: job.workerId, message }, 'Render job failed');
    await this.jobs.update(job.id, {
      status: ERenderJobStatus.Failed,
      error: message.slice(0, 2000),
      finishedAt: new Date(),
    });
    if (job.kind === ERenderJobKind.Setup && job.workerId) {
      await this.accounts.upsert({
        username: job.workerId,
        status: EKaggleAccountStatus.Failed,
        lastError: message.slice(0, 2000),
      });
      return;
    }
    if (job.workerId) await this.accounts.recordOutcome(job.workerId, 'failed');
    if (job.kind === ERenderJobKind.Images) {
      await this.failImageTargets(job, message);
      await this.finishImageJob(job, false);
      return;
    }
    for (const clip of job.payload.clips) await this.clipFailed(job, clip.key, message);
    await this.settleCampaign(job.campaignId, message);
  }

  /** Final campaign status once its render job has finished. */
  private async settleCampaign(campaignId?: string | null, error?: string): Promise<void> {
    if (!campaignId) return;
    const campaign = await this.campaigns.findById(campaignId);
    if (!campaign) return;
    if (await this.jobs.findOpenFor({ campaignId, kind: ERenderJobKind.Campaign })) return; // more to come
    const scenes = await this.scenes.listForCampaign(campaignId);
    const ready = scenes.filter((s) => s.videoStatus === EAssetStatus.Ready).length;
    const status =
      ready === scenes.length && ready > 0
        ? ECampaignStatus.Completed
        : ready > 0
          ? ECampaignStatus.Partial
          : ECampaignStatus.Failed;
    await this.setCampaign(campaign, {
      status,
      progress: status === ECampaignStatus.Failed ? campaign.progress : 100,
      stageMessage: status === ECampaignStatus.Completed ? 'Ready' : `${ready}/${scenes.length} videos ready`,
      error: status === ECampaignStatus.Completed ? null : (error ?? campaign.error ?? null),
      completedAt: new Date(),
    });
  }

  /**
   * Progress of a job, pushed to its owner with the notebook's own status (image or video): onto the campaign, or
   * onto the photoshoot for photoshoot image jobs.
   */
  private async reportJobProgress(
    job: RenderJob,
    progress: number,
    message: string | undefined,
    status: ECampaignStatus,
    jobStatus: ERenderJobStatus = ERenderJobStatus.Running,
  ): Promise<void> {
    const snapshot = kaggleJobStatus({
      ...job,
      status: jobStatus,
      progress,
      stageMessage: (message || job.stageMessage || '').slice(0, 250) || null,
      updatedAt: new Date(),
    });
    const photoshootId = job.payload.imageGeneration?.photoshootId;
    if (photoshootId && job.userId) await this.events.photoshootJob(job.userId, photoshootId, snapshot);
    if (!job.campaignId) return;
    const campaign = await this.campaigns.findById(job.campaignId);
    if (!campaign) return;
    const updated = await this.campaigns.update(campaign.id, {
      status,
      progress,
      stageMessage: (message || campaign.stageMessage || '').slice(0, 250),
    });
    if (updated) await this.events.campaign(updated, false, snapshot);
  }

  private async setCampaign(campaign: MarketingCampaign, patch: Partial<MarketingCampaign>): Promise<void> {
    const updated = await this.campaigns.update(campaign.id, patch);
    if (updated) await this.events.campaign(updated, true);
  }

  private async removeQuietly(key: string): Promise<void> {
    await this.storage.removeAsync(key).catch(() => false);
  }

  /** Capacity summary for the UI. */
  async capacity(): Promise<{
    accounts: number;
    ready: number;
    settingUp: number;
    slots: number;
    busy: number;
    waiting: number;
  }> {
    const accounts = (await this.accounts.list()).filter((a) => a.status !== EKaggleAccountStatus.Disabled);
    const ready = accounts.filter((a) => a.status === EKaggleAccountStatus.Ready && !isAccountCoolingDown(a));
    const busy = Object.values(await this.jobs.countBusyByWorker()).reduce((a, b) => a + b, 0);
    return {
      accounts: accounts.length,
      ready: ready.length,
      settingUp: accounts.filter(
        (a) => a.status === EKaggleAccountStatus.SettingUp || a.status === EKaggleAccountStatus.New,
      ).length,
      slots: ready.reduce((a, r) => a + r.concurrency, 0),
      busy,
      waiting: await this.jobs.countWaiting(),
    };
  }
}
