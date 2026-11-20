export interface MarketingCatalogItem {
  id: string;
  itemName: string;
  metalType?: string;
  purity?: string;
  categoryName?: string;
  /** Metal weight in grams (net), and the gross weight with stones. */
  netWeight?: number;
  grossWeight?: number;
  /** Carries a BIS hallmark (HUID). The HUID itself is not passed on. */
  hallmarked?: boolean;
  /** Storage key (or URL) of the item's main photo. */
  imageKey?: string;
}
