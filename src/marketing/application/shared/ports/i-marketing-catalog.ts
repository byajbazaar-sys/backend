import { MarketingCatalogItem } from '../domain';

/**
 * What marketing needs from the ByajBazaar app. Marketing code depends only on these interfaces; the adapters in
 * infrastructure/adapters plug in the real ByajBazaar services.
 */

/** Inventory + business profile (ByajBazaar main database + bucket). */
export const MARKETING_CATALOG = 'MARKETING_CATALOG';

export interface IMarketingCatalog {
  findItem(userId: string, itemId: string): Promise<MarketingCatalogItem | null>;
  readImage(imageKey: string): Promise<Buffer>;
  businessName(userId: string): Promise<string | null>;
}
