/** What an ad script may say about a piece — only facts from the inventory item, nothing invented. */
export interface AdScriptFacts {
  itemName: string;
  categoryName?: string;
  /** GOLD | SILVER | PLATINUM | DIAMOND | OTHER (inventory) — or rose gold read from the name. */
  metalType?: string;
  purity?: string;
  /** Metal weight in grams (net weight, else gross). */
  weightGrams?: number;
  /** The item has a BIS hallmark (HUID). */
  hallmarked?: boolean;
  shopName?: string | null;
}
