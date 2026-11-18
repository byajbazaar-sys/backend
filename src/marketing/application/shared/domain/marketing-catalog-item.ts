export interface MarketingCatalogItem {
  id: string;
  itemName: string;
  metalType?: string;
  purity?: string;
  categoryName?: string;
  /** Storage key (or URL) of the item's main photo. */
  imageKey?: string;
}
