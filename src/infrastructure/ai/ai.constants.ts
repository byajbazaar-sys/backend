/** Nova 2 Lite foundation model ID (on-demand direct invoke not supported in most regions). */
export const BEDROCK_NOVA_FOUNDATION_MODEL_ID = 'amazon.nova-2-lite-v1:0';

/** Default inference profile for Nova 2 Lite (use as Converse/Invoke modelId). */
export const BEDROCK_NOVA_INFERENCE_PROFILE_ID = 'global.amazon.nova-2-lite-v1:0';

/** Resolves a foundation model ID to its inference profile when needed. */
export function resolveBedrockModelId(modelId: string): string {
  if (modelId === BEDROCK_NOVA_FOUNDATION_MODEL_ID) {
    return BEDROCK_NOVA_INFERENCE_PROFILE_ID;
  }
  return modelId;
}

/** Gemini model for jewellery-events discovery. */
export const GEMINI_EVENTS_MODEL = 'gemini-2.5-flash';

/** Primary Gemini model for virtual try-on image generation. */
export const GEMINI_TRYON_MODEL = 'gemini-3-pro-image-preview';

/** Fallback when primary Gemini try-on model times out or fails. */
export const GEMINI_TRYON_FALLBACK_MODEL = 'gemini-2.5-flash-image';

/** Per-attempt timeout (ms) for try-on image generation. */
export const GEMINI_TRYON_TIMEOUT_MS = 40_000;

/** Aivot third-party try-on generate endpoint (relative to TRYON_API_BASE_URL). */
export const AIVOT_TRYON_GENERATE_PATH = '/gemini/generate-styled-image';

/** Default MIME for Aivot JPEG responses. */
export const AIVOT_TRYON_MIME = 'image/jpeg';

/** Default Aivot request timeout (ms). */
export const AIVOT_TRYON_TIMEOUT_MS = 90_000;

/** Retries for transient Aivot failures (408/429/5xx). */
export const AIVOT_TRYON_MAX_RETRIES = 2;
