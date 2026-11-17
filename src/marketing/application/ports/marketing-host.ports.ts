/**
 * What marketing needs from the ByajBazaar app. Marketing code depends only on these interfaces; the adapters in
 * infrastructure/adapters plug in the real ByajBazaar services.
 */

/** Inventory + business profile (ByajBazaar main database + bucket). */
export const MARKETING_CATALOG = 'MARKETING_CATALOG';
export interface MarketingCatalogItem {
  id: string;
  itemName: string;
  metalType?: string;
  purity?: string;
  categoryName?: string;
  /** Storage key (or URL) of the item's main photo. */
  imageKey?: string;
}
export interface IMarketingCatalog {
  findItem(userId: string, itemId: string): Promise<MarketingCatalogItem | null>;
  readImage(imageKey: string): Promise<Buffer>;
  businessName(userId: string): Promise<string | null>;
}

/** Live updates to the user's open app sessions (ByajBazaar AWS WebSocket). */
export const MARKETING_NOTIFIER = 'MARKETING_NOTIFIER';
export interface IMarketingNotifier {
  notifyUser(userId: string, payload: Record<string, unknown>): Promise<void>;
}

/**
 * Activity log (ByajBazaar logs service, separate logs database): campaign / photoshoot lifecycle, render jobs and
 * Kaggle account changes. Implementations never throw.
 */
export const MARKETING_ACTIVITY_LOG = 'MARKETING_ACTIVITY_LOG';
export interface MarketingActivity {
  /** e.g. CAMPAIGN_CREATED, RENDER_JOB_FAILED, KAGGLE_ACCOUNT_ADDED */
  action: string;
  /** campaign | photoshoot | render_job | kaggle_account */
  entityType: string;
  entityId?: string | null;
  /** The business (ByajBazaar user) it belongs to, if any. */
  userId?: string | null;
  /** Never secrets (Kaggle keys). */
  data?: Record<string, unknown>;
}
export interface IMarketingActivityLog {
  record(activity: MarketingActivity): Promise<void>;
}
