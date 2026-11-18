import { EAssetStatus } from '../enums';

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
