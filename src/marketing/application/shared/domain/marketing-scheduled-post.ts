import { MarketingPostStatus } from './marketing-post-status';

/** One photo or video inside a carousel post (in posting order). */
export interface MarketingScheduledPostItem {
  sourceType: 'campaign' | 'photoshoot';
  sourceId: string;
  sourceIndex: number | null;
  mediaType: 'IMAGE' | 'REEL';
  assetKey: string;
  title: string;
}

/** A person tagged on a photo. `x` / `y` (0–1, from the top-left) place the tag; reels and videos take no position. */
export interface InstagramUserTag {
  username: string;
  x?: number;
  y?: number;
}

/**
 * The Instagram publishing options the Graph API supports. Hiding the like count is not exposed by the API, so it
 * is not here.
 */
export interface InstagramPostOptions {
  /** Shop logo on the photos (top-left). Unset: the owner's brand-kit switch at publish time. */
  logoOverlay?: boolean;
  /** Facebook Page ID of a place (Instagram's location tag). */
  locationId?: string;
  /** Shown in the planner only. */
  locationName?: string;
  /** Up to 3 accounts invited as collaborators. */
  collaborators?: string[];
  /** People tagged on photos (single photo, or each carousel photo). */
  userTags?: InstagramUserTag[];
  /** Custom accessibility text (single photo posts). */
  altText?: string;
  /** Turned off right after publishing. */
  commentsDisabled?: boolean;
  /** Posted as the first comment right after publishing (e.g. hashtags). */
  firstComment?: string;
  /** Reels: also show the reel in the profile grid / feed (default true). */
  shareToFeed?: boolean;
  /** Reels: renames the reel's original audio. */
  audioName?: string;
  /** Reels: the frame (ms from the start) used as the cover. */
  thumbOffsetMs?: number;
}

export interface MarketingScheduledPost {
  id: string;
  userId: string;
  /** CAROUSEL: 2–10 photos / videos in `items`; the source fields then describe the first one. */
  mediaType: 'IMAGE' | 'REEL' | 'CAROUSEL';
  sourceType: 'campaign' | 'photoshoot';
  sourceId: string;
  sourceIndex?: number | null;
  sourceTitle: string;
  assetKey: string;
  items?: MarketingScheduledPostItem[] | null;
  options?: InstagramPostOptions | null;
  caption: string;
  scheduledAt: Date;
  status: MarketingPostStatus;
  instagramMediaId?: string | null;
  error?: string | null;
  /** Published, but an after-publish step (first comment, comments off) did not go through. */
  warning?: string | null;
  publishedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}
