/** Object-key prefixes safe to expose via the public image CDN Worker. */
export const IMAGE_CDN_ALLOWED_PREFIXES = ['inventory/', 'users/shop-logos/', 'orders/'] as const;

const LEGACY_B2_HOST_SUFFIXES = ['backblazeb2.com', 'amazonaws.com'];

export function isCdnEligibleKey(key: string): boolean {
  const normalized = normalizeObjectKey(key);
  if (!normalized) return false;
  return IMAGE_CDN_ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function normalizeObjectKey(key: string): string {
  return (key || '').trim().replace(/^\/+/, '');
}

/**
 * Object keys are reused when an image is replaced, so a version token (object ETag) is
 * appended to bust the edge/browser cache. The Worker ignores the query when reading B2.
 */
export function buildImageCdnUrl(key: string, cdnBase: string, version?: string): string {
  const normalized = normalizeObjectKey(key);
  if (!normalized || !cdnBase?.trim()) return '';
  const url = `${cdnBase.trim().replace(/\/+$/, '')}/${normalized}`;
  return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}

/**
 * Converts stored values to an object key when possible.
 * Supports legacy full B2/S3 URLs and raw keys.
 */
export function extractStorageKey(value: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return normalizeObjectKey(trimmed);
  }

  try {
    const url = new URL(trimmed);
    if (!LEGACY_B2_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))) {
      return null;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;

    // Path-style S3/B2: /bucket/key/parts...
    if (segments[0] === 'file' && segments.length >= 3) {
      return segments.slice(2).join('/');
    }

    return segments.slice(1).join('/');
  } catch {
    return null;
  }
}

export function resolvePublicImageUrl(
  storedValue: string,
  cdnBase: string | undefined,
  signedUrlResolver: (key: string) => Promise<string | null>,
): Promise<string | null> {
  const key = extractStorageKey(storedValue) ?? normalizeObjectKey(storedValue);
  if (!key) return Promise.resolve(null);

  if (cdnBase?.trim() && isCdnEligibleKey(key)) {
    return Promise.resolve(buildImageCdnUrl(key, cdnBase));
  }

  return signedUrlResolver(key);
}
