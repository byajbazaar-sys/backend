export const PUBLIC_CATALOG_SORTS = ['newest', 'price_asc', 'price_desc', 'weight_asc', 'weight_desc', 'name'] as const;

export type PublicCatalogSort = (typeof PUBLIC_CATALOG_SORTS)[number];
