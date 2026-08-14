/** DNS-safe subdomain segment length (RFC 1035 label max). */
export const CATALOG_SLUG_MAX_LENGTH = 63;

export const CATALOG_SLUG_TAKEN_MESSAGE =
  'This business name is already being used for a catalog URL. Please choose a unique business name.';

/** Build a URL-safe catalog slug from a business name (no auto-suffix on collision). */
export function buildCatalogSlug(businessName?: string | null): string {
  const raw = (businessName ?? '').trim();
  if (!raw) return '';

  const slug = raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug) return '';
  const trimmed = slug.slice(0, CATALOG_SLUG_MAX_LENGTH).replace(/-+$/g, '');
  return trimmed;
}

/** Validate slug format for public catalog hostnames. */
export function isValidCatalogSlug(slug?: string | null): boolean {
  if (!slug) return false;
  if (slug.length < 2 || slug.length > CATALOG_SLUG_MAX_LENGTH) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** Sanitize a slug path/query param; returns null when invalid. */
export function sanitizeCatalogSlugParam(value?: string | null): string | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized || !isValidCatalogSlug(normalized)) return null;
  return normalized;
}
