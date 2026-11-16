/**
 * Which item details a shop shows on its public catalog. Missing keys fall back to the defaults,
 * so new fields can be added without a data migration.
 */
export const CATALOG_DISPLAY_FIELDS = [
  'price',
  'metal',
  'purity',
  'netWeight',
  'grossWeight',
  'category',
  'description',
  'hallmark',
  'size',
  'sku',
  'makingCharges',
] as const;

export type CatalogDisplayField = (typeof CATALOG_DISPLAY_FIELDS)[number];
export type CatalogDisplaySettings = Record<CatalogDisplayField, boolean>;

export const DEFAULT_CATALOG_DISPLAY: CatalogDisplaySettings = {
  price: true,
  metal: true,
  purity: true,
  netWeight: true,
  grossWeight: true,
  category: true,
  description: true,
  hallmark: true,
  size: true,
  sku: false,
  makingCharges: false,
};

/** Saved (possibly partial / unknown-keyed) settings merged over the defaults. */
export function resolveCatalogDisplay(saved?: Record<string, unknown> | null): CatalogDisplaySettings {
  const out = { ...DEFAULT_CATALOG_DISPLAY };
  if (saved && typeof saved === 'object') {
    for (const key of CATALOG_DISPLAY_FIELDS) {
      if (typeof saved[key] === 'boolean') out[key] = saved[key] as boolean;
    }
  }
  return out;
}

/** Keeps only known keys with boolean values (for saving). */
export function sanitizeCatalogDisplay(input?: Record<string, unknown> | null): Partial<CatalogDisplaySettings> {
  const out: Partial<CatalogDisplaySettings> = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of CATALOG_DISPLAY_FIELDS) {
    if (typeof input[key] === 'boolean') out[key] = input[key] as boolean;
  }
  return out;
}
