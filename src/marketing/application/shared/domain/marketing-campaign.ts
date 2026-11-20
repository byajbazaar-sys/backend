import { ECampaignStatus } from '../enums';

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
  /** 'exact' (cut-out product, new background) or 'ai' (full AI scene). */
  imageMode: string;
  /** 'detailed' (Wan 2.2 A14B) or 'fast' (Wan 2.2 TI2V-5B) video render. */
  videoEngine: string;
  status: ECampaignStatus;
  progress: number;
  stageMessage?: string | null;
  mergedVideoKey?: string | null;
  error?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  completedAt?: Date | null;
}
