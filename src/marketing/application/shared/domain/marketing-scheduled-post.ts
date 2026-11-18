import { MarketingPostStatus } from './marketing-post-status';

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
