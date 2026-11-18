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
  updatedAt?: Date;
}
