import { Inject, Injectable } from '@nestjs/common';
import { EAttachmentMimeType } from '@shared-libs';
import { randomUUID } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { KaggleHealthService } from './kaggle-health.service';
import { KaggleRecoveryResult } from './kaggle-recovery-result';
import { MarketingConfig } from '../../../../marketing.config';
import {
  resolveImageMode,
  MarketingCampaign,
  MarketingScene,
  RenderClipSpec,
  RenderJob,
  WorkerSessionPayload,
  BUSY_RENDER_STATUSES,
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
  productMaskKey,
  EVoiceoverStatus,
  IMarketingVoiceoversRepository,
  MARKETING_VOICEOVERS_REPOSITORY,
  VOICE_LANGUAGES,
  sceneClipKey,
  sceneIndexFromClipKey,
} from '../../../shared';
import { buildLogoImagePrompt, buildSceneVideoPrompt, LOGO_VIDEO_PROMPT, VIDEO_NEGATIVE } from '../../campaigns';
import {
  isAccountCoolingDown,
  kaggleJobStatus,
  kaggleBatchStatus,
  jobTarget,
  kernelSlugOf,
  MIN_GPU_HOURS,
  STARTING_MAX_MS,
  buildImageWorkerNotebook,
  ImageNotebookJob,
  buildFastReelNotebook,
  buildWorkerNotebook,
  buildWorkerSessionNotebook,
  buildVoiceWorkerNotebook,
  VoiceNotebookJob,
  modelCacheContents,
  modelsDatasetSlug,
  NotebookClip,
  NotebookModelCache,
  WorkerNotebookJob,
  signMarketingWorkerToken,
  verifyMarketingWorkerToken,
  effectiveConcurrency,
  isSessionLimitError,
} from '../utils';
import { MarketingWorkerEvent } from './marketing-worker-event';
import { WorkerSessionAnswer } from './worker-session-answer';
import { WorkerSessionPoll } from './worker-session-poll';

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
/** A warm session is given a job only with at least this much Kaggle session time left (else it stops). */
const SESSION_MIN_LEFT_SECONDS = 45 * 60;
/** Extra idle warm sessions (another one is already warm) stop after this long. */
const EXTRA_IDLE_MS = 5 * 60 * 1000;
/** Idle warm sessions poll this often. */
const SESSION_POLL_SECONDS = 10;
/**
 * A warm session pipelines several scenes of one campaign over its two GPUs (images: GPU 0 paints the next while GPU
 * 1 judges; video: GPU 0 runs the next clip's high-noise pass while GPU 1 finishes the current one). Waiting
 * siblings are taken into the job it starts — up to these totals, and never the ones another free session can take.
 */
const PIPELINE_MAX_IMAGES = 4;
const PIPELINE_MAX_CLIPS = 3;
/** An idle warm session that stopped polling this long ago is gone. */
const SESSION_LOST_MS = 5 * 60 * 1000;
/** A job a session finished is checked for its final event after this long. */
const SETTLE_GRACE_MS = 2 * 60 * 1000;
/** Model cache builds are retried at most this often per account. */
const MODEL_CACHE_RETRY_MS = 6 * 60 * 60 * 1000;

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

/** Metals the image notebook can lock (a photoshoot's 'unknown' / 'diamond' leave it to the analyst and the photo). */
const KNOWN_METALS = new Set(['gold', 'silver', 'rose_gold', 'platinum']);

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
    @Inject(MARKETING_VOICEOVERS_REPOSITORY) private readonly voiceovers: IMarketingVoiceoversRepository,
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
  /**
   * Queues image generation for a campaign's scenes: **one IMAGES job per scene** (one batch), so free Kaggle
   * accounts paint them in parallel. Scenes already being painted are skipped. Video follows once the last image job
   * of the campaign has finished (`renderAfter`).
   */
  async queueCampaignImages(
    campaignId: string,
    sceneIndexes?: number[],
    renderAfter = true,
  ): Promise<RenderJob | null> {
    const campaign = await this.campaigns.findById(campaignId);
    if (!campaign) return null;
    const scenes = await this.scenes.listForCampaign(campaignId);
    const open = await this.jobs.listOpenFor({ campaignId, kind: ERenderJobKind.Images });
    const inFlight = new Set(open.flatMap((job) => [...unfinishedImageIndexes(job)]));
    const targets = scenes
      .filter((s) => sceneIndexes?.includes(s.index) ?? s.imageStatus !== EAssetStatus.Ready)
      .filter((s) => !inFlight.has(s.index));
    // Whichever image job finishes last decides about the video: keep the flag the same on all of them.
    const wantsVideo = renderAfter || open.some((job) => job.payload.imageGeneration?.renderAfter);
    if (wantsVideo) {
      for (const job of open) {
        const generation = job.payload.imageGeneration;
        if (generation && !generation.renderAfter) {
          await this.jobs.update(job.id, {
            payload: { ...job.payload, imageGeneration: { ...generation, renderAfter: true } },
          });
        }
      }
    }
    if (!targets.length) return null;

    const batchId = randomUUID();
    let first: RenderJob | null = null;
    for (const scene of targets) {
      const job = await this.jobs.create({
        kind: ERenderJobKind.Images,
        userId: campaign.userId,
        campaignId,
        status: ERenderJobStatus.Waiting,
        payload: {
          clips: [],
          batchId,
          imageGeneration: {
            type: 'campaign',
            mode: resolveImageMode(campaign.imageMode),
            sourceImageKey: campaign.sourceImageKey,
            title: campaign.title,
            style: campaign.style,
            renderAfter: wantsVideo,
            targets: [sceneImageTarget(campaign, scene)],
          },
        },
        progress: 0,
        attempts: 0,
      });
      first ??= job;
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
    return first;
  }

  /** Queues photoshoot shots: **one IMAGES job per shot** (one batch), painted in parallel on free accounts. */
  async queuePhotoshootImages(photoshootId: string, onlyIndex?: number): Promise<RenderJob | null> {
    const shoot = await this.photoshoots.findById(photoshootId);
    if (!shoot) return null;
    const allShots = await this.photoshootShots.listFor([shoot.id]);
    const open = (await this.jobs.listOpenFor({ userId: shoot.userId, kind: ERenderJobKind.Images })).filter(
      (job) => job.payload.imageGeneration?.photoshootId === shoot.id,
    );
    const inFlight = new Set(open.flatMap((job) => [...unfinishedImageIndexes(job)]));
    const selected = allShots
      .filter((s) => (typeof onlyIndex === 'number' ? s.index === onlyIndex : !isStatus(s.status, EAssetStatus.Ready)))
      .filter((s) => !inFlight.has(s.index));
    if (!selected.length) return null;
    const size = PHOTOSHOOT_ASPECTS[shoot.aspect as PhotoshootAspect] ?? PHOTOSHOOT_ASPECTS['3:4'];
    const targets = selected.map((shot) => ({
      index: shot.index,
      kind: shot.kind,
      prompt: shot.prompt,
      outputKey: `photoshoots/${shoot.userId}/${shoot.id}/shot-${shot.index}-${Date.now()}.jpg`,
      width: size.width,
      height: size.height,
    }));
    const batchId = randomUUID();
    let job: RenderJob | null = null;
    for (const target of targets) {
      const created = await this.jobs.create({
        kind: ERenderJobKind.Images,
        userId: shoot.userId,
        status: ERenderJobStatus.Waiting,
        payload: {
          clips: [],
          batchId,
          imageGeneration: {
            type: 'photoshoot',
            mode: resolveImageMode(shoot.imageMode),
            sourceImageKey: shoot.sourceImageKey,
            title: shoot.title,
            style: `${shoot.setting}; ${shoot.model}; ${shoot.outfit}`,
            photoshootId: shoot.id,
            metal: KNOWN_METALS.has(shoot.piece?.metal ?? '') ? shoot.piece.metal : undefined,
            targets: [target],
          },
        },
        progress: 0,
        attempts: 0,
      });
      job ??= created;
    }
    for (const shot of selected) {
      await this.photoshootShots.update(shot.id, { status: EAssetStatus.Generating, error: null });
    }
    await this.scheduler.schedule({ step: 'dispatch' });
    return job;
  }

  /** Generates the business logo backdrop with FLUX.2 [klein] in the Kaggle image notebook (the name is typeset). */
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
   * Queues the video render for a campaign: the given scenes (default all with a ready image) and the brand logo clip
   * when the brand has no logo video yet — **one CAMPAIGN job per clip** (one batch), rendered in parallel on free
   * accounts. Each scene's clip is the deliverable (there is no merged film). Clips already being rendered are skipped.
   * Called per scene as soon as its image is ready, so clips render while the other images are still painting.
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
      prompt: buildSceneVideoPrompt(s.motionPrompt, s.imagePrompt),
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
    const open = await this.jobs.listOpenFor({ campaignId, kind: ERenderJobKind.Campaign });
    const busy = new Set(open.flatMap((job) => job.payload.clips.map((c) => c.key)));
    const fresh = clips.filter((c) => !busy.has(c.key));
    if (!fresh.length) return null; // already rendering; the caller reports "busy"

    const batchId = randomUUID();
    let job: RenderJob | null = null;
    for (const clip of fresh) {
      const created = await this.jobs.create({
        kind: ERenderJobKind.Campaign,
        userId: campaign.userId,
        campaignId,
        status: ERenderJobStatus.Waiting,
        payload: { clips: [clip], batchId, videoEngine: campaign.videoEngine === 'fast' ? 'fast' : 'detailed' },
        progress: 0,
        attempts: 0,
      });
      job ??= created;
    }

    const freshKeys = new Set(fresh.map((c) => c.key));
    for (const s of wanted) {
      if (freshKeys.has(sceneClipKey(s.index))) {
        await this.scenes.update(s.id, { videoStatus: EAssetStatus.Generating, error: null });
      }
    }
    if (needsLogo && freshKeys.has(LOGO_CLIP_KEY)) {
      await this.brands.upsert({ userId: campaign.userId, logoVideoStatus: EAssetStatus.Generating });
    }
    // While other scene images are still painting, the campaign keeps showing their progress.
    if (!(await this.jobs.listOpenFor({ campaignId, kind: ERenderJobKind.Images })).length) {
      await this.setCampaign(campaign, { status: ECampaignStatus.WaitingGpu, stageMessage: 'Waiting for a free GPU' });
    }
    await this.scheduler.schedule({ step: 'dispatch' });
    return job;
  }

  /**
   * Queues a voiceover for the voice notebook (ChatterBox Multilingual). It waits for a free warm worker like every
   * other job; small enough to run beside a session's loaded image models instead of replacing them.
   */
  async queueVoiceover(voiceoverId: string): Promise<RenderJob | null> {
    const voiceover = await this.voiceovers.findById(voiceoverId);
    if (!voiceover) return null;
    const open = (await this.jobs.listOpenFor({ userId: voiceover.userId, kind: ERenderJobKind.Voice })).find(
      (job) => job.payload.voice?.voiceoverId === voiceoverId,
    );
    if (open) return open;
    const job = await this.jobs.create({
      kind: ERenderJobKind.Voice,
      userId: voiceover.userId,
      status: ERenderJobStatus.Waiting,
      payload: {
        clips: [],
        voice: { voiceoverId, outputKey: MarketingKeys.voiceAudio(voiceover.userId, voiceoverId) },
      },
      progress: 0,
      stageMessage: 'Waiting for a free GPU',
      attempts: 0,
    });
    await this.events.voiceover(voiceover.userId, voiceoverId, false, kaggleJobStatus(job));
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
    await this.wakeIdleSessions(); // first: an idle warm session takes the new job within a second
    await this.failStaleJobs();
    await this.syncAccounts();

    const workers = new Map((await this.pool.workers()).map((w) => [w.id, w]));
    const busy = await this.jobs.countBusyByWorker();
    const accounts = (await this.accounts.list()).filter((a) => workers.has(a.username));

    // New accounts run their one-time setup notebook; ready ones may (re)build their model cache with it.
    for (const account of accounts) {
      if (account.status !== EKaggleAccountStatus.SettingUp && account.status !== EKaggleAccountStatus.Ready) continue;
      if ((busy[account.username] ?? 0) >= effectiveConcurrency(workers.get(account.username).concurrency)) continue;
      const job = await this.jobs.claimNext(account.username, false);
      if (!job) continue;
      busy[account.username] = (busy[account.username] ?? 0) + 1;
      await this.startJob(job, account.username, 0);
    }

    const candidates: DispatchCandidate[] = [];
    /** Why each account cannot take work right now (logged when renders wait with no free account). */
    const unavailable: string[] = [];
    for (const account of accounts) {
      if (account.status !== EKaggleAccountStatus.Ready) {
        unavailable.push(`${account.username}: ${String(account.status).toLowerCase().replace(/_/g, ' ')}`);
        continue;
      }
      if (isAccountCoolingDown(account)) {
        unavailable.push(
          `${account.username}: resting after "${(account.lastError ?? 'a failed start').slice(0, 120)}"`,
        );
        continue;
      }
      const concurrency = effectiveConcurrency(workers.get(account.username).concurrency);
      const used = busy[account.username] ?? 0;
      if (used >= concurrency) {
        unavailable.push(`${account.username}: all ${concurrency} GPU session(s) in use`);
        continue;
      }
      const quota = await this.gpuQuota(account);
      if (!quota.usable) {
        unavailable.push(`${account.username}: weekly GPU quota nearly used (${quota.hoursLeft ?? '?'} h left)`);
        continue;
      }
      candidates.push({
        username: account.username,
        concurrency,
        used,
        gpuHoursLeft: quota.hoursLeft,
        lastAssignedAt: account.lastAssignedAt ? new Date(account.lastAssignedAt).getTime() : 0,
      });
    }

    if (!workers.size) unavailable.push('no Kaggle account is configured');
    if (candidates.length === 0) await this.reportNoCapacity(unavailable);

    if (this.config.publicApiBaseUrl) {
      await this.dispatchSessions(candidates);
      return;
    }

    // Without a public API URL notebooks cannot pull work: one notebook push per job.
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
   * Warm sessions pull waiting jobs themselves (`nextForSession`). Here: retire dead sessions, then start one new
   * session per waiting job that no idle or booting session will pick up — so a busy worker never delays the next
   * job, and nothing new starts while a warm one is free.
   */
  private async dispatchSessions(candidates: DispatchCandidate[]): Promise<void> {
    await this.reapSessions();
    const waiting = await this.jobs.countWaiting();
    const free = (await this.jobs.listSessions()).filter(
      (s) => s.status === ERenderJobStatus.Starting || s.payload.session?.state !== 'busy',
    ).length;
    let need = waiting - free;
    while (need > 0) {
      const candidate = pickDispatchCandidate(candidates);
      if (!candidate) break;
      candidate.used += 1;
      candidate.lastAssignedAt = Date.now();
      const slot = await this.freeSlot(candidate.username, candidate.concurrency);
      if (await this.startSession(candidate.username, slot)) need -= 1;
      else candidate.used = candidate.concurrency;
    }
    if (need > 0 || waiting > free) {
      const window = Math.floor(Date.now() / (RECHECK_DELAY_SECONDS * 1000));
      await this.scheduler.schedule(
        { step: 'dispatch' },
        { delaySeconds: RECHECK_DELAY_SECONDS, deduplicationId: `marketing-dispatch-${window}` },
      );
    }
  }

  /**
   * Idle warm sessions sleep on their WebSocket between polls: tell them work is waiting so they ask for it now
   * instead of at their next poll. A connection that is gone is forgotten (the session registers a new one).
   */
  private async wakeIdleSessions(): Promise<void> {
    if (!(await this.jobs.countWaiting())) return;
    const idle = (await this.jobs.listSessions()).filter(
      (s) =>
        s.status === ERenderJobStatus.Running && s.payload.session?.state === 'idle' && s.payload.session?.connectionId,
    );
    await Promise.all(
      idle.map(async (s) => {
        const delivered = await this.notifier.notifyConnection(s.payload.session.connectionId, {
          type: 'marketingWake',
        });
        if (!delivered) {
          const fresh = (await this.jobs.findById(s.id)) ?? s;
          await this.jobs.update(s.id, {
            payload: {
              ...fresh.payload,
              session: { ...(fresh.payload.session ?? { state: 'idle' }), connectionId: null },
            },
          });
        }
      }),
    );
  }

  /** Pushes a warm worker session notebook (with the account's model dataset mounted when it has one). */
  private async startSession(workerId: string, slot: number): Promise<boolean> {
    const session = await this.jobs.create({
      kind: ERenderJobKind.Worker,
      workerId,
      slot,
      status: ERenderJobStatus.Starting,
      payload: { clips: [], session: { state: 'starting', jobsRun: 0 } },
      progress: 0,
      stageMessage: 'Warm GPU worker booting',
      attempts: 0,
      startedAt: new Date(),
    });
    const account = await this.accounts.find(workerId);
    try {
      const notebook = buildWorkerSessionNotebook({
        jobId: session.id,
        token: signMarketingWorkerToken(session.id),
        apiBaseUrl: this.config.publicApiBaseUrl,
        wsUrl: this.config.websocketUrl,
        sessionSeconds: Math.max(3600, this.config.kaggleSessionHours * 3600 - SESSION_MARGIN_SECONDS),
      });
      const pushed = await this.pool.pushNotebook(
        workerId,
        { name: `byajbazaar-worker-${slot}`, title: `ByajBazaar Worker ${slot}` },
        notebook,
        { datasets: account?.modelsDataset ? [account.modelsDataset] : [] },
      );
      await this.jobs.update(session.id, { kernelRef: pushed.ref });
      await this.accounts.update(workerId, { lastAssignedAt: new Date(), lastError: null });
      this.logger.info({ account: workerId, slot, session: session.id }, 'Warm GPU worker started');
      return true;
    } catch (err) {
      const reason = (err as Error).message;
      if (isSessionLimitError(reason)) {
        // Kaggle still counts a session we closed moments ago (or one started outside the pool): try again on the
        // next dispatch round. No rest for the account, so its healthy workers keep running.
        await this.endSession(session, 'Kaggle has no free GPU session on this account yet — retrying shortly');
        this.logger.info({ account: workerId, slot }, 'Kaggle session limit reached — will retry');
        return false;
      }
      await this.endSession(session, `Could not start: ${reason}`, true);
      await this.accounts.update(workerId, {
        cooldownUntil: new Date(Date.now() + START_FAILURE_COOLDOWN_MS),
        lastError: `Could not start a notebook: ${reason}`.slice(0, 2000),
      });
      await this.healthEvent('KAGGLE_ACCOUNT_COOLDOWN', workerId, {
        reason,
        minutes: START_FAILURE_COOLDOWN_MS / 60_000,
        sessionId: session.id,
      });
      return false;
    }
  }

  /** Sessions that never booted, or stopped polling while idle, are closed (their slot frees up). */
  private async reapSessions(): Promise<void> {
    for (const session of await this.jobs.listSessions()) {
      const silentMs = Date.now() - new Date(session.updatedAt ?? session.startedAt ?? Date.now()).getTime();
      if (session.status === ERenderJobStatus.Starting && silentMs > STARTING_MAX_MS) {
        const kernelName = kernelSlugOf(session.kernelRef);
        const state =
          session.workerId && kernelName ? (await this.pool.sessionStatus(session.workerId, kernelName)).state : null;
        if (state === 'queued' && session.workerId) {
          await this.accounts.update(session.workerId, {
            cooldownUntil: new Date(Date.now() + START_FAILURE_COOLDOWN_MS),
            lastError: 'Kaggle kept the session queued (no GPU free on the account)',
          });
        }
        await this.endSession(session, 'The warm GPU worker never reported in', true);
        continue;
      }
      if (session.status !== ERenderJobStatus.Running || silentMs <= SESSION_LOST_MS) continue;
      const current = session.payload.session?.currentJobId
        ? await this.jobs.findById(session.payload.session.currentJobId)
        : null;
      // A busy session is silent while its job runs: the job's own watchdog covers it.
      if (current && BUSY_RENDER_STATUSES.includes(current.status)) continue;
      await this.endSession(session, 'The warm GPU worker stopped responding', true);
    }
  }

  private async endSession(session: RenderJob, reason: string, failed = false): Promise<void> {
    await this.jobs.update(session.id, {
      status: failed ? ERenderJobStatus.Failed : ERenderJobStatus.Done,
      stageMessage: reason.slice(0, 250),
      error: failed ? reason.slice(0, 2000) : null,
      finishedAt: new Date(),
      payload: { ...session.payload, session: { ...(session.payload.session ?? { state: 'idle' }), state: 'idle' } },
    });
    this.logger.info({ session: session.id, account: session.workerId, reason }, 'Warm GPU worker closed');
  }

  /**
   * A warm session asks for work (also its heartbeat). Settles the job it just ran, then hands it the oldest waiting
   * job (its notebook cells), or tells it to keep polling, or to stop: idle too long (only the last idle session
   * stays warm for warmIdleMinutes; extra ones stop after EXTRA_IDLE_MS), too little session time left, or the
   * account can no longer render. Null when the token is not valid.
   */
  async nextForSession(request: WorkerSessionPoll): Promise<WorkerSessionAnswer | null> {
    if (!request.sessionId || !verifyMarketingWorkerToken(request.sessionId, request.token)) return null;
    const session = await this.jobs.findById(request.sessionId);
    if (!session || session.kind !== ERenderJobKind.Worker) return null;
    if (!BUSY_RENDER_STATUSES.includes(session.status)) return { stop: true, reason: 'the session was closed' };

    const state = session.payload.session ?? { state: 'starting' as const };
    let settle = state.settle ?? null;
    if (state.currentJobId) {
      if (request.jobError) await this.settleSessionJob(session, state.currentJobId, request.jobError);
      else settle = { jobId: state.currentJobId, at: new Date().toISOString() };
    }
    if (settle && Date.now() - Date.parse(settle.at) > SETTLE_GRACE_MS) {
      await this.settleSessionJob(session, settle.jobId, null);
      settle = null;
    }

    const remaining = Math.max(0, Number(request.remainingSeconds) || 0);
    const base: WorkerSessionPayload = {
      ...state,
      currentJobId: null,
      settle,
      remainingSeconds: remaining,
      pipeline: request.pipeline ?? state.pipeline ?? null,
    };
    const stop = async (reason: string): Promise<WorkerSessionAnswer> => {
      await this.endSession({ ...session, payload: { ...session.payload, session: base } }, `Stopped: ${reason}`);
      await this.scheduler.schedule({ step: 'dispatch' }); // a fresh session takes over if work is waiting
      return { stop: true, reason };
    };

    if (remaining < SESSION_MIN_LEFT_SECONDS) return stop('the Kaggle session time is nearly used up');
    const account = session.workerId ? await this.accounts.find(session.workerId) : null;
    const enabled = (await this.pool.workers()).some((w) => w.id === session.workerId);
    // A rest (cooldown) only blocks *new* notebooks on the account: a session that is already up keeps working.
    if (!account || !enabled || account.status !== EKaggleAccountStatus.Ready) {
      return stop('the account is not available for renders');
    }
    if (!(await this.gpuQuota(account)).usable) return stop('the account is out of GPU hours');

    const job = await this.jobs.claimNextForSession(session, base.pipeline);
    if (job) return this.handToSession(session, base, await this.absorbSiblings(session, job), remaining);

    const now = Date.now();
    const idleSince = state.state === 'idle' && state.idleSince ? state.idleSince : new Date(now).toISOString();
    const idleMs = now - Date.parse(idleSince);
    const idleOthers = (await this.jobs.listSessions()).filter(
      (s) => s.id !== session.id && s.status === ERenderJobStatus.Running && s.payload.session?.state === 'idle',
    );
    // The session with the most time left (ties: lowest id) stays warm; the others go home early.
    const keeper = idleOthers.every((s) => {
      const left = s.payload.session?.remainingSeconds ?? 0;
      return left < remaining || (left === remaining && s.id > session.id);
    });
    const limitMs = (await this.settings.kaggle()).warmIdleMinutes * 60_000;
    if (idleMs >= (keeper ? limitMs : Math.min(limitMs, EXTRA_IDLE_MS))) {
      return stop(`idle for ${Math.round(idleMs / 60_000)} min`);
    }
    await this.jobs.update(session.id, {
      status: ERenderJobStatus.Running,
      stageMessage: `Warm · idle ${Math.floor(idleMs / 60_000)} min`,
      payload: { ...session.payload, session: { ...base, state: 'idle', idleSince } },
    });
    return { pollSeconds: SESSION_POLL_SECONDS, listening: !!state.connectionId };
  }

  /**
   * Takes waiting jobs of the same batch (image shots of one photo) or campaign (scene clips) into the job a session is
   * starting, so the session pipelines them over its two GPUs. Jobs that the other idle or booting sessions would take
   * are left for them — real parallel accounts beat a pipeline. Returns the job with the extra clips / images.
   */
  private async absorbSiblings(session: RenderJob, job: RenderJob): Promise<RenderJob> {
    const generation = job.payload.imageGeneration;
    const isImages = job.kind === ERenderJobKind.Images && !!generation && generation.type !== 'logo';
    const isVideo = job.kind === ERenderJobKind.Campaign && !!job.campaignId;
    if (!isImages && !isVideo) return job;
    const match = isImages
      ? { kind: job.kind, batchId: job.payload.batchId }
      : {
          kind: job.kind,
          campaignId: job.campaignId ?? undefined,
          videoEngine: job.payload.videoEngine ?? 'detailed',
        };
    if (isImages && !match.batchId) return job;
    const done = new Set(job.payload.done ?? []);
    const pending = isImages
      ? unfinishedImageIndexes(job).size
      : job.payload.clips.filter((c) => !done.has(c.key)).length;
    const room = (isImages ? PIPELINE_MAX_IMAGES : PIPELINE_MAX_CLIPS) - pending;
    if (room <= 0) return job;
    const waiting = (await this.jobs.listOpenFor({ campaignId: job.campaignId ?? undefined, kind: job.kind })).filter(
      (other) =>
        other.id !== job.id &&
        other.status === ERenderJobStatus.Waiting &&
        (isImages
          ? other.payload.batchId === match.batchId
          : other.campaignId === job.campaignId &&
            (other.payload.videoEngine ?? 'detailed') === (job.payload.videoEngine ?? 'detailed')),
    );
    const others = (await this.jobs.listSessions()).filter(
      (s) => s.id !== session.id && (s.status === ERenderJobStatus.Starting || s.payload.session?.state !== 'busy'),
    ).length;
    const take = Math.min(room, waiting.length - others);
    if (take <= 0) return job;
    const taken = await this.jobs.absorbWaiting(job, match, take);
    if (!taken.length) return job;
    const payload = { ...job.payload, batchId: job.payload.batchId ?? job.id };
    if (isImages && generation) {
      const targets = [...generation.targets];
      for (const other of taken) {
        const otherDone = new Set(other.payload.imageGeneration?.doneImages ?? []);
        for (const target of other.payload.imageGeneration?.targets ?? []) {
          if (!otherDone.has(target.index) && !targets.some((t) => t.index === target.index)) targets.push(target);
        }
      }
      payload.imageGeneration = { ...generation, targets };
    } else {
      const clips = [...job.payload.clips];
      for (const other of taken) {
        const otherDone = new Set(other.payload.done ?? []);
        for (const clip of other.payload.clips) {
          if (!otherDone.has(clip.key) && !clips.some((c) => c.key === clip.key)) clips.push(clip);
        }
      }
      payload.clips = clips;
    }
    const updated = await this.jobs.update(job.id, { payload }).catch((err: unknown) => {
      this.logger.error({ err, jobId: job.id }, 'Could not save the pipelined job; its siblings go back in the queue');
      return null;
    });
    if (!updated) {
      await this.jobs.releaseAbsorbed(taken);
      return job;
    }
    this.logger.info(
      { jobId: job.id, session: session.id, absorbed: taken.map((t) => t.id), kind: job.kind },
      'Pipelining waiting siblings in one warm session',
    );
    return { ...job, payload };
  }

  /** The job a session ran is still marked busy although the session moved on: it crashed (or never reported). */
  private async settleSessionJob(session: RenderJob, jobId: string, jobError?: string | null): Promise<void> {
    const job = await this.jobs.findById(jobId);
    if (!job || !BUSY_RENDER_STATUSES.includes(job.status) || job.payload.sessionJobId !== session.id) return;
    if (jobError) await this.failJob(job, `The GPU worker crashed: ${jobError}`);
    else await this.restartJob(job, 'The job ended without reporting a result', false, false, true);
  }

  private async handToSession(
    session: RenderJob,
    base: WorkerSessionPayload,
    job: RenderJob,
    remaining: number,
  ): Promise<WorkerSessionAnswer> {
    let notebook: Record<string, unknown>;
    try {
      if (!this.config.websocketUrl) throw new Error('WEBSOCKET_API_URL is not configured');
      notebook =
        job.kind === ERenderJobKind.Images
          ? buildImageWorkerNotebook(await this.imageNotebookJob(job))
          : job.kind === ERenderJobKind.Voice
            ? buildVoiceWorkerNotebook(await this.voiceNotebookJob(job))
            : this.videoNotebook(job, await this.notebookJob(job, Math.max(1800, remaining - SESSION_MARGIN_SECONDS)));
    } catch (err) {
      await this.failJob(job, `Could not start the GPU worker: ${(err as Error).message}`);
      return { pollSeconds: 1 };
    }
    await this.jobs.update(session.id, {
      status: ERenderJobStatus.Running,
      stageMessage: `Running: ${jobTarget(job)}`.slice(0, 250),
      payload: {
        ...session.payload,
        session: { ...base, state: 'busy', currentJobId: job.id, idleSince: null, jobsRun: (base.jobsRun ?? 0) + 1 },
      },
    });
    if (job.workerId) await this.accounts.update(job.workerId, { lastAssignedAt: new Date(), lastError: null });
    const message = job.attempts > 0 ? 'Continuing on a warm GPU worker' : 'Starting on a warm GPU worker';
    const progress = Math.max(1, job.progress);
    await this.jobs.update(job.id, { stageMessage: message, progress });
    await this.reportJobProgress(
      job,
      progress,
      message,
      job.kind === ERenderJobKind.Images ? ECampaignStatus.Planning : ECampaignStatus.Rendering,
      ERenderJobStatus.Starting,
    );
    await this.scheduleWatch(job.id);
    const cells = ((notebook.cells as { cell_type: string; source: string }[]) ?? [])
      .filter((cell) => cell.cell_type === 'code')
      .map((cell) => cell.source);
    // A merge-only job needs no GPU model: the worker keeps whatever it has loaded.
    // The logo clip is animated on the CPU: a logo-only job must not make a warm session drop its loaded models.
    const gpuClips = job.payload.clips.filter((c) => c.key !== LOGO_CLIP_KEY);
    const pipeline =
      job.kind === ERenderJobKind.Images
        ? 'image'
        : job.kind === ERenderJobKind.Voice
          ? 'voice'
          : gpuClips.length
            ? job.payload.videoEngine === 'fast'
              ? 'video-fast'
              : 'video'
            : 'cpu';
    return { job: { id: job.id, kind: job.kind, pipeline, cells } };
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
          payload: { clips: [] },
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

    if (this.config.publicApiBaseUrl) await this.queueModelCaches(configured.map((w) => w.id));

    const listed = new Set(configured.map((w) => w.id));
    for (const account of known.values()) {
      if (!listed.has(account.username) && account.status !== EKaggleAccountStatus.Disabled) {
        await this.accounts.upsert({ username: account.username, status: EKaggleAccountStatus.Disabled });
      }
    }
  }

  /**
   * Ready accounts without the current model dataset get a cache-only SETUP job (at most every
   * MODEL_CACHE_RETRY_MS); they keep rendering meanwhile, downloading the models in each session.
   */
  private async queueModelCaches(usernames: string[]): Promise<void> {
    if (!this.config.huggingFaceToken) return;
    const dataset = modelsDatasetSlug();
    for (const account of await this.accounts.list()) {
      if (!usernames.includes(account.username) || account.status !== EKaggleAccountStatus.Ready) continue;
      if (account.modelsDataset === `${account.username}/${dataset}`) continue;
      if (account.modelsAttemptAt && Date.now() - new Date(account.modelsAttemptAt).getTime() < MODEL_CACHE_RETRY_MS) {
        continue;
      }
      if (await this.jobs.findOpenFor({ kind: ERenderJobKind.Setup, workerId: account.username })) continue;
      await this.accounts.update(account.username, { modelsAttemptAt: new Date() });
      await this.jobs.create({
        kind: ERenderJobKind.Setup,
        workerId: account.username,
        status: ERenderJobStatus.Waiting,
        payload: { clips: [], cacheOnly: true },
        progress: 0,
        attempts: 0,
      });
      this.logger.info({ account: account.username, dataset }, 'Queued the Kaggle model cache build');
    }
  }

  /**
   * Renders are waiting but no account can take them: log why (CloudWatch) and tell admins (activity log), at most
   * every NO_CAPACITY_ALERT_MS per server so the 2-minute re-check does not flood either.
   */
  private async reportNoCapacity(unavailable: string[] = []): Promise<void> {
    if (Date.now() - this.lastNoCapacityAlert < NO_CAPACITY_ALERT_MS) return;
    const health = await this.kaggleHealth.report();
    if (health.waiting === 0) return;
    this.lastNoCapacityAlert = Date.now();
    const issues = health.issues.filter((i) => i.level !== 'info').map((i) => i.message);
    const reasons = [...unavailable, ...issues.filter((m) => !unavailable.includes(m))];
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
    for (const job of (await this.jobs.listBusy()).filter((j) => j.kind !== ERenderJobKind.Worker)) {
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
    const kernelName = kernelSlugOf(job.kernelRef);
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
          : job.kind === ERenderJobKind.Voice
            ? buildVoiceWorkerNotebook(await this.voiceNotebookJob(job))
            : this.videoNotebook(job, await this.notebookJob(job));
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
          : job.kind === ERenderJobKind.Voice
            ? { name: `byajbazaar-voice-${slot}`, title: `ByajBazaar Voice ${slot}` }
            : { name: `byajbazaar-render-${slot}`, title: `ByajBazaar Render ${slot}` };
    let pushed: { ref: string };
    try {
      pushed = await this.pool.pushNotebook(workerId, kernel, notebook);
    } catch (err) {
      const reason = (err as Error).message;
      if (isSessionLimitError(reason)) {
        // The account is full on Kaggle's side for now: back to the queue untouched (same account for setups).
        await this.jobs.update(job.id, {
          status: ERenderJobStatus.Waiting,
          ...(job.kind === ERenderJobKind.Setup ? {} : { workerId: null }),
          slot: null,
          kernelRef: null,
          stageMessage: 'Waiting for a free GPU',
        });
        this.logger.info(
          { jobId: job.id, kind: job.kind, account: workerId },
          'Kaggle session limit reached — re-queued',
        );
        return false;
      }
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

  /** `budgetSeconds`: session time the job may use (a warm session passes what it has left). */
  private async notebookJob(job: RenderJob, budgetSeconds?: number): Promise<WorkerNotebookJob> {
    const base = {
      jobId: job.id,
      token: signMarketingWorkerToken(job.id),
      wsUrl: this.config.websocketUrl,
      apiBaseUrl: this.config.publicApiBaseUrl,
    };
    if (job.kind === ERenderJobKind.Setup) {
      return {
        ...base,
        kind: 'setup',
        modelCache: await this.modelCacheFor(job),
        hfToken: this.config.huggingFaceToken,
      };
    }
    if (job.kind === ERenderJobKind.Images) throw new Error('Image jobs require the image notebook');

    const campaign = job.campaignId ? await this.campaigns.findById(job.campaignId) : null;
    // On a continuation, clips finished by an earlier session are skipped.
    const done = new Set(job.payload.done ?? []);
    const pending = job.payload.clips.filter((c) => !done.has(c.key));
    const clips: NotebookClip[] = await Promise.all(
      pending.map(async (c) => ({
        key: c.key,
        imageUrl: await this.storage.getUrlAsync(c.imageKey),
        maskUrl: c.key === LOGO_CLIP_KEY ? undefined : await this.productMaskUrl(c.imageKey),
        prompt: c.prompt,
        negative: VIDEO_NEGATIVE,
        seed: -1,
        uploadUrl: await this.storage.generateUploadUrlAsync(c.outputKey, EAttachmentMimeType.VideoMp4),
      })),
    );

    return {
      ...base,
      kind: 'render',
      preset: campaign?.quality === 'hd' ? 'reel_hq' : 'reel_fast',
      clips,
      sessionBudgetSeconds:
        budgetSeconds ?? Math.max(3600, this.config.kaggleSessionHours * 3600 - SESSION_MARGIN_SECONDS),
    };
  }

  /** The video notebook a CAMPAIGN job asks for: fast (TI2V-5B) or detailed (A14B, also every setup job). */
  private videoNotebook(job: RenderJob, notebookJob: WorkerNotebookJob): Record<string, unknown> {
    return notebookJob.kind === 'render' && job.payload.videoEngine === 'fast'
      ? buildFastReelNotebook(notebookJob)
      : buildWorkerNotebook(notebookJob);
  }

  /**
   * What the setup notebook publishes as the account's private model dataset (with the account's own credentials),
   * or undefined when it already has the current one. Only with warm sessions — per-job notebooks don't mount it.
   */
  private async modelCacheFor(job: RenderJob): Promise<NotebookModelCache | undefined> {
    if (!job.workerId || !this.config.publicApiBaseUrl) return undefined;
    const account = await this.accounts.find(job.workerId);
    if (!this.config.huggingFaceToken) return undefined; // FLUX.2 [klein] 9B cannot be downloaded without it
    const dataset = `${job.workerId}/${modelsDatasetSlug()}`;
    if (account?.modelsDataset === dataset) return undefined;
    const { username, key } = await this.pool.accountCredentials(job.workerId);
    await this.accounts.update(job.workerId, { modelsAttemptAt: new Date() });
    return { dataset, username, key, ...modelCacheContents() };
  }

  private async voiceNotebookJob(job: RenderJob): Promise<VoiceNotebookJob> {
    const spec = job.payload.voice;
    const voiceover = spec ? await this.voiceovers.findById(spec.voiceoverId) : null;
    if (!spec || !voiceover) throw new Error('The voiceover of this job no longer exists');
    const name = VOICE_LANGUAGES[voiceover.language as keyof typeof VOICE_LANGUAGES] ?? 'English';
    return {
      jobId: job.id,
      token: signMarketingWorkerToken(job.id),
      wsUrl: this.config.websocketUrl,
      apiBaseUrl: this.config.publicApiBaseUrl,
      voiceoverId: voiceover.id,
      text: voiceover.text,
      languageLabel: `${name} (${voiceover.language})`,
      settings: voiceover.settings,
      sampleUrl: await this.storage.getUrlAsync(voiceover.sampleKey),
      uploadUrl: await this.storage.generateUploadUrlAsync(spec.outputKey, EAttachmentMimeType.AudioMpeg),
    };
  }

  /** URL of a still's product mask, or undefined for stills made before masks existed (their clips skip the lock). */
  private async productMaskUrl(imageKey: string): Promise<string | undefined> {
    const key = productMaskKey(imageKey);
    try {
      return (await this.storage.existsAsync(key)) ? await this.storage.getUrlAsync(key) : undefined;
    } catch {
      return undefined;
    }
  }

  private async imageNotebookJob(job: RenderJob): Promise<ImageNotebookJob> {
    if (!this.config.huggingFaceToken) {
      throw new Error(
        'MARKETING_HF_TOKEN is not set: FLUX.2 [klein] 9B is gated on Hugging Face. Add a read token of an account ' +
          'that accepted its licence to the backend env and deploy.',
      );
    }
    const generation = job.payload.imageGeneration;
    if (!generation) throw new Error('The image job payload is missing its generation details');
    const done = new Set(generation.doneImages ?? []);
    const sourceImageUrl = generation.sourceImageKey
      ? await this.storage.getUrlAsync(generation.sourceImageKey)
      : undefined;
    const targets = await Promise.all(
      generation.targets
        .filter((target) => !done.has(target.index))
        .map(async (target) => {
          // A restarted job reuses the output key: drop an earlier attempt's product mask first.
          if (generation.type !== 'logo') await this.removeQuietly(productMaskKey(target.outputKey));
          return {
            index: target.index,
            kind: target.kind,
            prompt: target.prompt,
            motionPrompt: target.motionPrompt,
            uploadUrl: await this.storage.generateUploadUrlAsync(target.outputKey, EAttachmentMimeType.ImageJpeg),
            maskUploadUrl:
              generation.type === 'logo'
                ? undefined
                : await this.storage.generateUploadUrlAsync(
                    productMaskKey(target.outputKey),
                    EAttachmentMimeType.ImagePng,
                  ),
            width: target.width,
            height: target.height,
          };
        }),
    );
    if (!targets.length) throw new Error('The image job has no unfinished images');
    return {
      jobId: job.id,
      token: signMarketingWorkerToken(job.id),
      wsUrl: this.config.websocketUrl,
      apiBaseUrl: this.config.publicApiBaseUrl,
      sourceImageUrl,
      type: generation.type,
      mode: generation.mode ?? 'exact',
      title: generation.title,
      style: generation.style,
      metal: generation.metal,
      targets,
      hfToken: this.config.huggingFaceToken,
    };
  }

  // ---------------------------------------------------------------- notebook events

  isValidWorkerConnect(jobId?: string, token?: string): boolean {
    return !!jobId && verifyMarketingWorkerToken(jobId, token);
  }

  /** Progress from a Kaggle notebook. Returns false when the token is invalid. */
  async handleWorkerEvent(event: MarketingWorkerEvent, connectionId?: string): Promise<boolean> {
    if (!event.jobId || !verifyMarketingWorkerToken(event.jobId, event.token)) return false;
    const job = await this.jobs.findById(event.jobId);
    if (!job || !BUSY_RENDER_STATUSES.includes(job.status)) return true; // late or duplicate

    if (job.kind === ERenderJobKind.Setup) return this.handleSetupEvent(job, event);
    if (job.kind === ERenderJobKind.Worker) return this.handleSessionEvent(job, event, connectionId);

    if (event.stage === 'sessionExpiring') {
      const progress = Math.max(job.progress ?? 0, Math.min(99, Math.round(Number(event.progress) || 0)));
      // In a warm session the session itself stops at its next poll (too little time left).
      await this.restartJob({ ...job, progress }, 'The Kaggle session reached its time limit', true, false, true);
      return true;
    }

    if (job.kind === ERenderJobKind.Images) return this.handleImageWorkerEvent(job, event);
    if (job.kind === ERenderJobKind.Voice) return this.handleVoiceEvent(job, event);

    if (event.status === 'failed') {
      await this.failJob(job, event.message || 'Rendering failed');
      await this.scheduler.schedule({ step: 'dispatch' });
      return true;
    }

    if (event.stage === 'clipDone' && event.clipKey) {
      // Kept in the logs: the seed re-renders this exact take; notes say what its quality check still saw.
      this.logger.info(
        { jobId: job.id, clipKey: event.clipKey, seed: event.seed ?? null, qualityNotes: event.qualityNotes ?? [] },
        'Clip delivered',
      );
      await this.clipDone(job, event.clipKey);
    }
    if (event.stage === 'clipFailed' && event.clipKey) await this.clipFailed(job, event.clipKey, event.message);

    if (event.status === 'completed') {
      for (const key of event.failedClips ?? []) await this.clipFailed(job, key, 'Rendering failed');
      if (job.workerId) await this.accounts.recordOutcome(job.workerId, 'completed');
      await this.jobs.update(job.id, {
        status: ERenderJobStatus.Done,
        progress: 100,
        stageMessage: event.message || 'Done',
        finishedAt: new Date(),
      });
      await this.finishVideoJob(job);
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

  private async handleVoiceEvent(job: RenderJob, event: MarketingWorkerEvent): Promise<boolean> {
    if (event.status === 'failed') {
      await this.failJob(job, event.message || 'Speech generation failed');
      await this.scheduler.schedule({ step: 'dispatch' });
      return true;
    }
    if (event.status === 'completed') {
      await this.voiceDone(job, event.message);
      await this.scheduler.schedule({ step: 'dispatch' });
      return true;
    }
    const progress = Math.max(job.progress ?? 0, Math.min(99, Math.round(Number(event.progress) || 0)));
    await this.jobs.update(job.id, {
      status: ERenderJobStatus.Running,
      progress,
      stageMessage: (event.message || job.stageMessage || 'Speaking').slice(0, 250),
    });
    await this.reportJobProgress(job, progress, event.message, ECampaignStatus.Rendering);
    return true;
  }

  private async voiceDone(job: RenderJob, message?: string): Promise<void> {
    const spec = job.payload.voice;
    const voiceover = spec ? await this.voiceovers.findById(spec.voiceoverId) : null;
    if (!spec || !voiceover || !(await this.storage.existsAsync(spec.outputKey))) {
      await this.failJob(job, 'The voice worker finished but the speech upload is missing');
      return;
    }
    if (voiceover.audioKey && voiceover.audioKey !== spec.outputKey) await this.removeQuietly(voiceover.audioKey);
    await this.voiceovers.update(voiceover.id, {
      audioKey: spec.outputKey,
      status: EVoiceoverStatus.Ready,
      error: null,
    });
    await this.jobs.update(job.id, {
      status: ERenderJobStatus.Done,
      progress: 100,
      stageMessage: (message || 'Voiceover ready').slice(0, 250),
      finishedAt: new Date(),
    });
    if (job.workerId) await this.accounts.recordOutcome(job.workerId, 'completed');
    await this.events.voiceover(voiceover.userId, voiceover.id, true);
  }

  private async handleImageWorkerEvent(job: RenderJob, event: MarketingWorkerEvent): Promise<boolean> {
    if (event.stage === 'imageDone' && typeof event.imageIndex === 'number') {
      await this.imageDone(job, event.imageIndex, event.imagePrompt, event.motionPrompt);
    } else if (event.stage === 'imageFailed' && typeof event.imageIndex === 'number') {
      this.logger.warn(
        { jobId: job.id, account: job.workerId, imageIndex: event.imageIndex, reason: event.message },
        'Render image failed',
      );
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
        // The direction stays as planned: the prompt actually used carries the notebook's metal lock and fix
        // sentences, which would pile up with every regeneration.
        motionPrompt: motionPrompt?.slice(0, 2000) || scene.motionPrompt,
        imageStatus: EAssetStatus.Ready,
        error: null,
      });
      const campaign = await this.campaigns.findById(job.campaignId);
      if (campaign) await this.events.campaign(campaign, true);
      if (generation.renderAfter) await this.renderSceneEarly(job.campaignId, index);
    } else if (generation.photoshootId) {
      const shots = await this.photoshootShots.listFor([generation.photoshootId]);
      const shot = shots.find((item) => item.index === index);
      if (shot) {
        if (shot.imageKey && shot.imageKey !== target.outputKey) {
          await this.removeQuietly(shot.imageKey);
          await this.removeQuietly(productMaskKey(shot.imageKey));
        }
        await this.photoshootShots.update(shot.id, {
          imageKey: target.outputKey,
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
      // Other scenes are still being painted on other accounts: the last image job decides what comes next.
      if ((await this.jobs.listOpenFor({ campaignId: job.campaignId, kind: ERenderJobKind.Images })).length) return;
      const scenes = await this.scenes.listForCampaign(job.campaignId);
      const ready = scenes.filter((scene) => scene.imageStatus === EAssetStatus.Ready);
      const someFailed = !success || scenes.some((scene) => scene.imageStatus === EAssetStatus.Failed);
      const hasVideos = scenes.some((scene) => scene.videoStatus === EAssetStatus.Ready);
      if (ready.length && generation.renderAfter) {
        await this.renderCampaignImages(generation, job.campaignId);
      } else if (!ready.length || someFailed) {
        await this.setCampaign(campaign, {
          status: hasVideos ? ECampaignStatus.Partial : ECampaignStatus.Failed,
          stageMessage: ready.length ? 'Some images failed — try again' : 'Image generation failed',
          error: ready.length ? 'Some scene images could not be generated' : 'No scene images could be generated',
        });
      } else {
        await this.setCampaign(campaign, {
          status: hasVideos ? ECampaignStatus.Partial : ECampaignStatus.Failed,
          stageMessage: 'Scene images ready',
          error: null,
        });
      }
    } else if (generation.photoshootId) {
      const siblings = (await this.jobs.listOpenFor({ userId: job.userId, kind: ERenderJobKind.Images })).filter(
        (open) => open.payload.imageGeneration?.photoshootId === generation.photoshootId,
      );
      if (siblings.length) {
        await this.notifyPhotoshoot(generation.photoshootId); // finished shots show up while the rest paint
        return;
      }
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

  /**
   * A scene's image is ready while others still paint: queue its clip now so a free GPU starts on it at once (the
   * last image job still queues whatever is left). Not while the brand logo is being made — the campaign waits for it.
   */
  private async renderSceneEarly(campaignId: string, index: number): Promise<void> {
    const campaign = await this.campaigns.findById(campaignId);
    if (!campaign) return;
    const brand = await this.brands.find(campaign.userId);
    if (brand?.logoImageStatus === EAssetStatus.Generating) return;
    try {
      await this.queueCampaignRender(campaignId, [index]);
    } catch (err) {
      this.logger.warn({ err, campaignId, index }, 'Early scene clip could not be queued — it follows the batch');
    }
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

  private async handleSessionEvent(
    session: RenderJob,
    event: MarketingWorkerEvent,
    connectionId?: string,
  ): Promise<boolean> {
    if (event.stage === 'sessionListening') {
      // An idle session's WebSocket: dispatch pushes `marketingWake` to it the moment work is queued.
      if (!connectionId) return true;
      const fresh = (await this.jobs.findById(session.id)) ?? session;
      await this.jobs.update(session.id, {
        payload: {
          ...fresh.payload,
          session: { ...(fresh.payload.session ?? { state: 'starting' }), connectionId },
        },
      });
      return true;
    }
    if (event.status === 'completed' || event.status === 'failed') {
      await this.endSession(session, event.message || 'Stopped', event.status === 'failed');
      await this.scheduler.schedule({ step: 'dispatch' });
      return true;
    }
    const ready = event.stage === 'sessionReady';
    await this.jobs.update(session.id, {
      status: ready ? ERenderJobStatus.Running : session.status,
      stageMessage: (event.message || session.stageMessage || '').slice(0, 250),
      payload: {
        ...session.payload,
        session: {
          ...(session.payload.session ?? { state: 'starting' }),
          ...(typeof event.modelsCached === 'boolean' ? { modelsCached: event.modelsCached } : {}),
        },
      },
    });
    return true;
  }

  private async handleSetupEvent(job: RenderJob, event: MarketingWorkerEvent): Promise<boolean> {
    const markReady = async (): Promise<void> => {
      const account = job.workerId ? await this.accounts.find(job.workerId) : null;
      if (account?.status === EKaggleAccountStatus.Ready && !event.gpuInfo) return;
      await this.accounts.upsert({
        username: job.workerId,
        status: EKaggleAccountStatus.Ready,
        readyAt: account?.readyAt ?? new Date(),
        gpuInfo: event.gpuInfo?.slice(0, 250) ?? account?.gpuInfo ?? null,
        lastError: null,
      });
      if (account?.status !== EKaggleAccountStatus.Ready) {
        this.logger.info({ account: job.workerId, gpu: event.gpuInfo }, 'Kaggle account ready');
        await this.scheduler.schedule({ step: 'dispatch' }); // start using it
      }
    };
    if (event.stage === 'accountReady') {
      // Checks passed; the same session goes on building the model cache — renders may start meanwhile.
      await markReady();
      await this.jobs.update(job.id, {
        status: ERenderJobStatus.Running,
        progress: Number(event.progress) || 10,
        stageMessage: (event.message || 'Building the model cache').slice(0, 250),
      });
      return true;
    }
    if (event.status === 'completed') {
      await this.jobs.update(job.id, {
        status: ERenderJobStatus.Done,
        progress: 100,
        stageMessage: (event.message || 'Done').slice(0, 250),
        finishedAt: new Date(),
      });
      await markReady();
      if (event.modelsDataset && job.workerId) {
        await this.accounts.update(job.workerId, { modelsDataset: event.modelsDataset.slice(0, 200) });
        this.logger.info({ account: job.workerId, dataset: event.modelsDataset }, 'Kaggle model cache ready');
      } else if (event.modelsCacheError) {
        this.logger.warn({ account: job.workerId, err: event.modelsCacheError }, 'Kaggle model cache not built');
        await this.healthEvent('KAGGLE_MODEL_CACHE_FAILED', job.workerId ?? null, { error: event.modelsCacheError });
      }
    } else if (event.status === 'failed') {
      await this.failJob(job, event.message || 'Account setup failed');
    } else {
      await this.jobs.update(job.id, {
        status: ERenderJobStatus.Running,
        progress: Number(event.progress) || 0,
        stageMessage: (event.message || job.stageMessage || '').slice(0, 250),
      });
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

  // ---------------------------------------------------------------- failures & campaign state

  /** Busy jobs with no progress for a while: continue them in a new session (or fail once out of restarts). */
  private async failStaleJobs(): Promise<void> {
    const stale = await this.jobs.findStale(BUSY_RENDER_STATUSES, new Date(Date.now() - STALE_JOB_MS));
    // Warm sessions are quiet while their job runs; reapSessions() handles them.
    for (const job of stale.filter((j) => j.kind !== ERenderJobKind.Worker)) {
      await this.restartJob(job, 'The GPU worker stopped responding');
    }
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
    const kernelName = kernelSlugOf(job.kernelRef);
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
  /** `keepSession`: the warm session the job ran in is still alive (it asked for more work / will stop itself). */
  private async restartJob(
    job: RenderJob,
    reason: string,
    planned = false,
    force = false,
    keepSession = false,
  ): Promise<void> {
    if (job.kind === ERenderJobKind.Worker) {
      await this.endSession(job, reason, true);
      return;
    }
    if (job.payload.sessionJobId && !keepSession) {
      // The session died with the job: close it so its slot frees up.
      const session = await this.jobs.findById(job.payload.sessionJobId);
      if (session && BUSY_RENDER_STATUSES.includes(session.status)) await this.endSession(session, reason, true);
    }
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
      payload: { ...job.payload, sessionJobId: null },
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
      const account = await this.accounts.find(job.workerId);
      if (job.payload.cacheOnly || account?.status === EKaggleAccountStatus.Ready) {
        this.logger.warn({ account: job.workerId, message }, 'Kaggle model cache build failed — account stays ready');
        return;
      }
      await this.accounts.upsert({
        username: job.workerId,
        status: EKaggleAccountStatus.Failed,
        lastError: message.slice(0, 2000),
      });
      return;
    }
    if (job.kind === ERenderJobKind.Worker) return;
    if (job.workerId) await this.accounts.recordOutcome(job.workerId, 'failed');
    if (job.kind === ERenderJobKind.Images) {
      await this.failImageTargets(job, message);
      await this.finishImageJob(job, false);
      return;
    }
    if (job.kind === ERenderJobKind.Voice) {
      const voiceoverId = job.payload.voice?.voiceoverId;
      const voiceover = voiceoverId ? await this.voiceovers.findById(voiceoverId) : null;
      if (voiceover) {
        await this.voiceovers.update(voiceover.id, { status: EVoiceoverStatus.Failed, error: message.slice(0, 500) });
        await this.events.voiceover(voiceover.userId, voiceover.id, true);
      }
      return;
    }
    for (const clip of job.payload.clips) await this.clipFailed(job, clip.key, message);
    await this.finishVideoJob(job, message);
  }

  /** After a CAMPAIGN (video) job ended: settle the campaign once its last clip job is done. */
  private async finishVideoJob(job: RenderJob, error?: string): Promise<void> {
    await this.settleCampaign(job.campaignId, error);
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
    const current: RenderJob = {
      ...job,
      status: jobStatus,
      progress,
      stageMessage: (message || job.stageMessage || '').slice(0, 250) || null,
      updatedAt: new Date(),
    };
    // Jobs of one batch run in parallel on several accounts: owners see one status with the average progress.
    let snapshot = kaggleJobStatus(current);
    if (job.payload.batchId) {
      const batch = (await this.jobs.listBatch(job.payload.batchId)).map((other) =>
        other.id === job.id ? current : other,
      );
      snapshot = kaggleBatchStatus(batch) ?? snapshot;
      progress = snapshot.progress;
      message = snapshot.stageMessage ?? message;
    }
    const photoshootId = job.payload.imageGeneration?.photoshootId;
    if (photoshootId && job.userId) await this.events.photoshootJob(job.userId, photoshootId, snapshot);
    const voiceoverId = job.payload.voice?.voiceoverId;
    if (voiceoverId && job.userId) await this.events.voiceover(job.userId, voiceoverId, false, snapshot);
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
