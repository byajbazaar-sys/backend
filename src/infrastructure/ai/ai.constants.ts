/** Aivot third-party try-on generate endpoint (relative to TRYON_API_BASE_URL). */
export const AIVOT_TRYON_GENERATE_PATH = '/gemini/generate-styled-image';

/** Default MIME for Aivot JPEG responses. */
export const AIVOT_TRYON_MIME = 'image/jpeg';

/** Default Aivot request timeout (ms). */
export const AIVOT_TRYON_TIMEOUT_MS = 90_000;

/** Retries for transient Aivot failures (408/429/5xx). */
export const AIVOT_TRYON_MAX_RETRIES = 2;

/** Default Cloudflare Workers AI model for virtual try-on (balanced cost vs quality). */
export const CLOUDFLARE_TRYON_MODEL = '@cf/black-forest-labs/flux-2-klein-9b';

/** Cheapest/fastest Cloudflare try-on model. */
export const CLOUDFLARE_TRYON_MODEL_FAST = '@cf/black-forest-labs/flux-2-klein-4b';

/** Best quality — highest cost (use sparingly). */
export const CLOUDFLARE_TRYON_MODEL_QUALITY = '@cf/black-forest-labs/flux-2-dev';

/** UI / API keys for selectable Cloudflare try-on models. */
export const CLOUDFLARE_TRYON_MODEL_OPTIONS = {
  'klein-4b': CLOUDFLARE_TRYON_MODEL_FAST,
  'klein-9b': CLOUDFLARE_TRYON_MODEL,
} as const;

export type CloudflareTryOnModelKey = keyof typeof CLOUDFLARE_TRYON_MODEL_OPTIONS;

export const CLOUDFLARE_TRYON_MODEL_KEYS = Object.keys(CLOUDFLARE_TRYON_MODEL_OPTIONS) as CloudflareTryOnModelKey[];

export function resolveCloudflareTryOnModelId(modelKey?: string, fallback = CLOUDFLARE_TRYON_MODEL): string {
  const trimmed = modelKey?.trim();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed in CLOUDFLARE_TRYON_MODEL_OPTIONS) {
    return CLOUDFLARE_TRYON_MODEL_OPTIONS[trimmed as CloudflareTryOnModelKey];
  }
  if (trimmed.startsWith('@cf/')) {
    return trimmed;
  }
  return fallback;
}

/** Cloudflare FLUX klein max input image dimension (px). */
export const CLOUDFLARE_TRYON_MAX_IMAGE_PX = 512;

/** Default MIME for Cloudflare JPEG outputs. */
export const CLOUDFLARE_TRYON_MIME = 'image/jpeg';

/** Default Cloudflare Workers AI request timeout (ms). */
export const CLOUDFLARE_TRYON_TIMEOUT_MS = 180_000;

/** Retries per API key before rotating to the next key. */
export const CLOUDFLARE_TRYON_MAX_RETRIES = 2;
