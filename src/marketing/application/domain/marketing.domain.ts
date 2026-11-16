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
