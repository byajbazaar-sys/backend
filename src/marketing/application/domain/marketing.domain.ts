import { EAssetStatus, ECampaignStatus, EKaggleAccountStatus, ERenderJobKind, ERenderJobStatus } from '../enums';

export interface MarketingCampaign {
  id: string;
  userId: string;
  title: string;
  sourceType: 'inventory' | 'upload';
  inventoryItemId?: string | null;
  /** Input image, copied into the marketing bucket. */
  sourceImageKey: string;
  style: string;
  quality: string;
  status: ECampaignStatus;
  progress: number;
  stageMessage?: string | null;
  mergedVideoKey?: string | null;
  error?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  completedAt?: Date | null;
}

/** One of the 5 scenes of a campaign. */
export interface MarketingScene {
  id: string;
  campaignId: string;
  index: number;
  /** Image-to-image prompt (scene). */
  imagePrompt: string;
  /** Camera / motion prompt for the video model. */
  motionPrompt: string;
  imageKey?: string | null;
  imageStatus: EAssetStatus;
  videoKey?: string | null;
  videoStatus: EAssetStatus;
  error?: string | null;
  updatedAt?: Date;
}

/** Per-business brand kit, reused by every campaign. */
export interface MarketingBrand {
  userId: string;
  businessName: string;
  logoImageKey?: string | null;
  logoImageStatus: EAssetStatus;
  logoVideoKey?: string | null;
  logoVideoStatus: EAssetStatus;
  error?: string | null;
  updatedAt?: Date;
}

export interface KaggleAccount {
  username: string;
  status: EKaggleAccountStatus;
  concurrency: number;
  lastError?: string | null;
  setupAttemptAt?: Date | null;
  readyAt?: Date | null;
  gpuInfo?: string | null;
  /** Weekly GPU hours left at the last quota check (cached; refreshed every few minutes while in use). */
  gpuHoursLeft?: number | null;
  quotaCheckedAt?: Date | null;
  /** Not given new jobs until then (it failed to start a notebook). */
  cooldownUntil?: Date | null;
  /** When it was last given a job (equally free accounts take turns). */
  lastAssignedAt?: Date | null;
  jobsCompleted?: number;
  jobsFailed?: number;
  updatedAt?: Date;
}

/** API credentials of one Kaggle account (kaggle_credentials). `apiKey` is plain text here; it is encrypted at rest. */
export interface KaggleCredential {
  id: string;
  /** Kaggle username (lower-case); also the worker id used in kernel refs and kaggle_accounts. */
  username: string;
  /** Legacy API key (kaggle.json) or a `KGAT_…` access token. */
  apiKey: string;
  /** Parallel notebooks this account may run (1–4). */
  concurrency: number;
  /** Disabled accounts are kept but not used for renders. */
  enabled: boolean;
  label?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RenderClipSpec {
  /** "scene-0" … "scene-4", or "logo". */
  key: string;
  sceneId?: string;
  imageKey: string;
  prompt: string;
  /** Destination key in the marketing bucket. */
  outputKey: string;
}

export interface RenderJobPayload {
  clips: RenderClipSpec[];
  imageGeneration?: {
    type: 'campaign' | 'photoshoot' | 'logo';
    sourceImageKey?: string;
    title: string;
    style?: string;
    renderAfter?: boolean;
    photoshootId?: string;
    targets: {
      index: number;
      kind: string;
      prompt: string;
      motionPrompt?: string;
      outputKey: string;
      width: number;
      height: number;
    }[];
    doneImages?: number[];
  };
  /** Merge of all scene videos (rendered here or already stored) ending on the logo clip. */
  merge?: { sceneKeys: string[]; outputKey: string } | null;
  /** Clip keys already rendered and stored — skipped when the job continues in a new Kaggle session. */
  done?: string[];
  /** The merged film was uploaded (no merge needed on continuation). */
  mergeDone?: boolean;
}

/** Unit of work for one Kaggle notebook session. */
export interface RenderJob {
  id: string;
  kind: ERenderJobKind;
  userId?: string | null;
  campaignId?: string | null;
  /** Fixed account for SETUP jobs; the claiming account for others. */
  workerId?: string | null;
  slot?: number | null;
  status: ERenderJobStatus;
  payload: RenderJobPayload;
  progress: number;
  stageMessage?: string | null;
  kernelRef?: string | null;
  /** Automatic restarts so far (Kaggle session expired / crashed / hung). */
  attempts: number;
  error?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

/** One product photo → a set of AI ad photos. */
export interface Photoshoot {
  id: string;
  userId: string;
  title: string;
  inventoryItemId: string | null;
  sourceImageKey: string;
  /** What the piece is, used to describe it to the image model (keeps metal / design faithful). */
  piece: PhotoshootPiece;
  setting: string;
  model: string;
  outfit: string;
  aspect: string;
  status: string;
  error?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PhotoshootPiece {
  /** e.g. "bracelet", "necklace", "pair of earrings". */
  noun: string;
  metal: string;
  /** Where it is worn: neck | ears | finger | wrist | ankle | forehead | nose | hand. */
  wornOn: string;
  /** Extra words from the item (name, purity, stones) to anchor the design. */
  detail?: string;
}

export interface PhotoshootShot {
  id: string;
  photoshootId: string;
  index: number;
  /** present | closeup | hands | worn */
  kind: string;
  prompt: string;
  imageKey: string | null;
  status: string;
  error?: string | null;
  updatedAt?: Date;
}

export type MarketingPostStatus = 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED';

export interface MarketingScheduledPost {
  id: string;
  userId: string;
  mediaType: 'IMAGE' | 'REEL';
  sourceType: 'campaign' | 'photoshoot';
  sourceId: string;
  sourceIndex?: number | null;
  sourceTitle: string;
  assetKey: string;
  caption: string;
  scheduledAt: Date;
  status: MarketingPostStatus;
  instagramMediaId?: string | null;
  error?: string | null;
  publishedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}
