export interface PublicCatalogFacets {
  categories: { id: string; name: string; count: number }[];
  metals: string[];
  purities: string[];
  minWeight?: number;
  maxWeight?: number;
  minPrice?: number;
  maxPrice?: number;
}
