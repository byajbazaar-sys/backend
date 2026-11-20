import { EAssetStatus } from '../enums';

/** Per-business brand kit, reused by every campaign. */
export interface MarketingBrand {
  userId: string;
  businessName: string;
  logoImageKey?: string | null;
  logoImageStatus: EAssetStatus;
  logoVideoKey?: string | null;
  logoVideoStatus: EAssetStatus;
  error?: string | null;
  /** The shop name as the Hindi voice should say it (Devanagari), and the name it was made for. */
  spokenName?: string | null;
  spokenNameFor?: string | null;
  /** Typed in by the owner: never replaced by the model. */
  spokenNameByUser?: boolean;
  updatedAt?: Date;
}
