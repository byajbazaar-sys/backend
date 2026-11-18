export interface PublicCatalogFacets {
  categories: { id: string; name: string; count: number }[];
  metals: string[];
  purities: string[];
  sizes: string[];
  /** Pieces marked BIS hallmarked. */
  hallmarkedCount: number;
  minWeight?: number;
  maxWeight?: number;
  minPrice?: number;
  maxPrice?: number;
}
