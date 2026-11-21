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
  /** Storage ref (or URL) of the logo the owner uploaded in their profile, if any. */
  shopLogoRef(userId: string): Promise<string | null>;
  /** A viewable URL for a ByajBazaar image ref (signed when it is a storage key). */
  imageUrl(ref: string): Promise<string | null>;
  /** Shop name and where it is (the business profile's address and state), for captions. */
  businessProfile(userId: string): Promise<{ name: string | null; address: string | null; state: string | null }>;
}
