import {
  KaggleAccount,
  KaggleCredential,
  MarketingBrand,
  MarketingCampaign,
  MarketingScene,
  MarketingScheduledPost,
  Photoshoot,
  PhotoshootShot,
  RenderJob,
} from '../domain';
import { EKaggleAccountStatus, ERenderJobStatus } from '../enums';

export const MARKETING_CAMPAIGNS_REPOSITORY = 'MARKETING_CAMPAIGNS_REPOSITORY';
export interface IMarketingCampaignsRepository {
  create(campaign: Omit<MarketingCampaign, 'id'>): Promise<MarketingCampaign>;
  findById(id: string): Promise<MarketingCampaign | null>;
  findForUser(id: string, userId: string): Promise<MarketingCampaign | null>;
  listForUser(userId: string, limit: number): Promise<MarketingCampaign[]>;
  update(id: string, patch: Partial<MarketingCampaign>): Promise<MarketingCampaign | null>;
  delete(id: string): Promise<void>;
  countActiveForUser(userId: string): Promise<number>;
}

export const MARKETING_SCENES_REPOSITORY = 'MARKETING_SCENES_REPOSITORY';
export interface IMarketingScenesRepository {
  createMany(scenes: Omit<MarketingScene, 'id'>[]): Promise<MarketingScene[]>;
  listForCampaign(campaignId: string): Promise<MarketingScene[]>;
  findByIndex(campaignId: string, index: number): Promise<MarketingScene | null>;
  update(id: string, patch: Partial<MarketingScene>): Promise<MarketingScene | null>;
  deleteForCampaign(campaignId: string): Promise<void>;
}

export const MARKETING_BRANDS_REPOSITORY = 'MARKETING_BRANDS_REPOSITORY';
export interface IMarketingBrandsRepository {
  find(userId: string): Promise<MarketingBrand | null>;
  upsert(brand: Partial<MarketingBrand> & { userId: string }): Promise<MarketingBrand>;
}

export const KAGGLE_ACCOUNTS_REPOSITORY = 'KAGGLE_ACCOUNTS_REPOSITORY';
export interface IKaggleAccountsRepository {
  list(): Promise<KaggleAccount[]>;
  find(username: string): Promise<KaggleAccount | null>;
  upsert(account: Partial<KaggleAccount> & { username: string }): Promise<KaggleAccount>;
  /** Atomically moves an account between statuses; false if it was not in `from`. */
  transition(username: string, from: EKaggleAccountStatus[], patch: Partial<KaggleAccount>): Promise<boolean>;
  /** Changes fields of an existing account (no-op when it does not exist). */
  update(username: string, patch: Partial<Omit<KaggleAccount, 'username'>>): Promise<void>;
  /** Atomically counts a finished render job on the account. */
  recordOutcome(username: string, outcome: 'completed' | 'failed'): Promise<void>;
}

export const KAGGLE_CREDENTIALS_REPOSITORY = 'KAGGLE_CREDENTIALS_REPOSITORY';
/** Kaggle API credentials, managed by admins. Implementations encrypt `apiKey` at rest. */
export interface IKaggleCredentialsRepository {
  list(filter?: { enabled?: boolean }): Promise<KaggleCredential[]>;
  find(username: string): Promise<KaggleCredential | null>;
  create(credential: Omit<KaggleCredential, 'id' | 'createdAt' | 'updatedAt'>): Promise<KaggleCredential>;
  update(
    username: string,
    patch: Partial<Pick<KaggleCredential, 'apiKey' | 'concurrency' | 'enabled' | 'label'>>,
  ): Promise<KaggleCredential | null>;
  /** False when no such account. */
  delete(username: string): Promise<boolean>;
}

export const RENDER_JOBS_REPOSITORY = 'RENDER_JOBS_REPOSITORY';
export interface IRenderJobsRepository {
  create(job: Omit<RenderJob, 'id'>): Promise<RenderJob>;
  findById(id: string): Promise<RenderJob | null>;
  update(id: string, patch: Partial<RenderJob>): Promise<RenderJob | null>;
  /** Busy slots per account (STARTING / RUNNING). */
  countBusyByWorker(): Promise<Record<string, number>>;
  /** Jobs currently on Kaggle (STARTING / RUNNING), oldest first. */
  listBusy(): Promise<RenderJob[]>;
  /** Render jobs waiting for a GPU (not account setups), oldest first. */
  listWaiting(limit: number): Promise<RenderJob[]>;
  countWaiting(): Promise<number>;
  /** Kernel slots held by an account's busy jobs. */
  busySlots(workerId: string): Promise<number[]>;
  /**
   * Atomically claims the oldest WAITING job for `workerId` (row lock, skip locked): SETUP jobs only for their own
   * account, other jobs for any ready account.
   */
  claimNext(workerId: string, includeWork: boolean): Promise<RenderJob | null>;
  findStale(statuses: ERenderJobStatus[], olderThan: Date): Promise<RenderJob[]>;
  /** Waiting / busy job for a campaign or brand logo, to avoid queuing duplicates. */
  findOpenFor(filter: { campaignId?: string; userId?: string; kind?: string }): Promise<RenderJob | null>;
}

export const MARKETING_PHOTOSHOOTS_REPOSITORY = 'MARKETING_PHOTOSHOOTS_REPOSITORY';
export interface IMarketingPhotoshootsRepository {
  create(shoot: Omit<Photoshoot, 'id'>): Promise<Photoshoot>;
  findById(id: string): Promise<Photoshoot | null>;
  findForUser(id: string, userId: string): Promise<Photoshoot | null>;
  listForUser(userId: string, limit: number): Promise<Photoshoot[]>;
  update(id: string, patch: Partial<Photoshoot>): Promise<Photoshoot | null>;
  delete(id: string): Promise<void>;
  countActiveForUser(userId: string): Promise<number>;
}

export const MARKETING_PHOTOSHOOT_SHOTS_REPOSITORY = 'MARKETING_PHOTOSHOOT_SHOTS_REPOSITORY';
export interface IMarketingPhotoshootShotsRepository {
  createMany(shots: Omit<PhotoshootShot, 'id'>[]): Promise<PhotoshootShot[]>;
  listFor(photoshootIds: string[]): Promise<PhotoshootShot[]>;
  findByIndex(photoshootId: string, index: number): Promise<PhotoshootShot | null>;
  update(id: string, patch: Partial<PhotoshootShot>): Promise<PhotoshootShot | null>;
}

export const MARKETING_SCHEDULED_POSTS_REPOSITORY = 'MARKETING_SCHEDULED_POSTS_REPOSITORY';
export interface IMarketingScheduledPostsRepository {
  create(post: Omit<MarketingScheduledPost, 'id'>): Promise<MarketingScheduledPost>;
  findForUser(id: string, userId: string): Promise<MarketingScheduledPost | null>;
  listForUser(userId: string, limit: number): Promise<MarketingScheduledPost[]>;
  update(id: string, patch: Partial<MarketingScheduledPost>): Promise<MarketingScheduledPost | null>;
  cancelForUser(id: string, userId: string): Promise<boolean>;
  hasOpenForSource(
    userId: string,
    sourceType: 'campaign' | 'photoshoot',
    sourceId: string,
    sourceIndex?: number,
  ): Promise<boolean>;
  claimDue(now: Date, limit: number): Promise<MarketingScheduledPost[]>;
}

/** Kaggle health behaviour, editable by admins. */
export interface KaggleSettings {
  /**
   * Fix stuck renders without an admin: re-run failed account setups after 30 minutes (instead of 6 hours), move a
   * render that Kaggle keeps queued or that never booted to another account, restart silent sessions sooner.
   */
  autoRecover: boolean;
}

export const DEFAULT_KAGGLE_SETTINGS: KaggleSettings = { autoRecover: true };

export const MARKETING_SETTINGS_REPOSITORY = 'MARKETING_SETTINGS_REPOSITORY';
export interface IMarketingSettingsRepository {
  kaggle(): Promise<KaggleSettings>;
  saveKaggle(patch: Partial<KaggleSettings>): Promise<KaggleSettings>;
}
