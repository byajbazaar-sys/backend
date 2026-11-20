import { RenderJob } from '../domain';
import { ERenderJobKind, ERenderJobStatus } from '../enums';
export const RENDER_JOBS_REPOSITORY = 'RENDER_JOBS_REPOSITORY';

export interface IRenderJobsRepository {
  create(job: Omit<RenderJob, 'id'>): Promise<RenderJob>;
  findById(id: string): Promise<RenderJob | null>;
  update(id: string, patch: Partial<RenderJob>): Promise<RenderJob | null>;
  /** Busy slots per account (STARTING / RUNNING); jobs running inside a warm WORKER session count as its slot. */
  countBusyByWorker(): Promise<Record<string, number>>;
  /** Jobs currently on Kaggle (STARTING / RUNNING), oldest first. */
  listBusy(): Promise<RenderJob[]>;
  /** Render jobs waiting for a GPU (not account setups), oldest first. */
  listWaiting(limit: number): Promise<RenderJob[]>;
  countWaiting(): Promise<number>;
  /** Waiting render jobs per kind (account setups excluded). */
  countWaitingByKind(): Promise<Partial<Record<ERenderJobKind, number>>>;
  /** Kernel slots held by an account's busy jobs. */
  busySlots(workerId: string): Promise<number[]>;
  /**
   * Atomically claims the oldest WAITING job for `workerId` (row lock, skip locked): SETUP jobs only for their own
   * account, other jobs for any ready account.
   */
  claimNext(workerId: string, includeWork: boolean): Promise<RenderJob | null>;
  /**
   * Atomically claims the oldest WAITING work job (IMAGES / CAMPAIGN / LOGO) for a warm session of `workerId`:
   * it becomes STARTING on that account, in the session's slot and kernel, with payload.sessionJobId set.
   */
  /** Oldest waiting job, preferring the kinds of `pipeline` (the models the session already has loaded). */
  claimNextForSession(session: RenderJob, pipeline?: string | null): Promise<RenderJob | null>;
  /**
   * Atomically takes up to `limit` WAITING jobs of `match.kind` — of `match.batchId`, or else of `match.campaignId` —
   * into `into` (row lock, skip locked): they become DONE with payload.mergedInto = into.id and join its batch.
   * Returns them; their clips / images are now `into`'s to render.
   */
  absorbWaiting(
    into: RenderJob,
    match: { kind: ERenderJobKind; batchId?: string; campaignId?: string; videoEngine?: string },
    limit: number,
  ): Promise<RenderJob[]>;
  /** Puts jobs taken by absorbWaiting back in the queue as they were (the take-over could not be saved). */
  releaseAbsorbed(jobs: RenderJob[]): Promise<void>;
  /** Live warm WORKER sessions (STARTING / RUNNING), oldest first. */
  listSessions(): Promise<RenderJob[]>;
  findStale(statuses: ERenderJobStatus[], olderThan: Date): Promise<RenderJob[]>;
  /** Every waiting / busy job matching the filter, oldest first. */
  listOpenFor(filter: { campaignId?: string; userId?: string; kind?: string }): Promise<RenderJob[]>;
  /** All jobs of a batch (see RenderJobPayload.batchId), oldest first. */
  listBatch(batchId: string): Promise<RenderJob[]>;
  /** Waiting / busy job for a campaign or brand logo, to avoid queuing duplicates. */
  findOpenFor(filter: {
    campaignId?: string;
    userId?: string;
    kind?: string;
    workerId?: string;
  }): Promise<RenderJob | null>;
  /**
   * Newest IMAGES and CAMPAIGN (video) job of each campaign — with every other job of its batch — for the image /
   * video notebook status.
   */
  latestForCampaigns(campaignIds: string[]): Promise<RenderJob[]>;
  /** Most recently finished (DONE / FAILED) non-setup jobs, newest first. */
  listRecentFinished(limit: number): Promise<RenderJob[]>;
  /** Newest IMAGES job of each photoshoot, with every other job of its batch. */
  latestForPhotoshoots(photoshootIds: string[]): Promise<RenderJob[]>;
  /** The newest VOICE job of each voiceover. */
  latestForVoiceovers(voiceoverIds: string[]): Promise<RenderJob[]>;
}
