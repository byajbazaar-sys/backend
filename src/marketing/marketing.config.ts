import { IS3StorageOptions } from '@shared-libs';

/**
 * Marketing bucket prefixes served by the media CDN Worker (cloudflare/image-worker/wrangler.media.toml,
 * ALLOWED_PREFIXES): campaign / photoshoot images, scene clips and Reels, brand logos, Instagram post images.
 */
export const MARKETING_MEDIA_CDN_PREFIXES = ['campaigns/', 'brands/', 'photoshoots/', 'instagram/'] as const;

/**
 * Marketing runs on its own resources (database, S3 bucket, QStash queue), configured with MARKETING_* env vars.
 * Every value is optional: without them the module falls back to the main database / bucket and runs jobs
 * without the queue, so ByajBazaar keeps booting even when marketing is not set up.
 */
export class MarketingConfig {
  readonly db = {
    host: env('MARKETING_DB_HOST') ?? env('DB_HOST') ?? 'localhost',
    port: Number(env('MARKETING_DB_PORT') ?? env('DB_PORT') ?? 5432),
    database: env('MARKETING_DB_NAME') ?? env('DB_NAME') ?? 'byajbazaar_db',
    username: env('MARKETING_DB_USER') ?? env('DB_USER') ?? 'postgres',
    password: env('MARKETING_DB_PASS') ?? env('DB_PASS') ?? 'postgres',
    /** True when a dedicated marketing database is configured. */
    dedicated: !!env('MARKETING_DB_HOST'),
  };

  readonly storage: IS3StorageOptions = {
    accessKeyId: env('MARKETING_S3_AWS_ACCESS_KEY_ID') ?? env('S3_AWS_ACCESS_KEY_ID') ?? '',
    secretAccessKey: env('MARKETING_S3_AWS_SECRET_ACCESS_KEY') ?? env('S3_AWS_SECRET_ACCESS_KEY') ?? '',
    bucket: env('MARKETING_S3_BUCKET_NAME') ?? env('S3_BUCKET_NAME') ?? '',
    region: env('MARKETING_S3_BUCKET_REGION') ?? env('S3_BUCKET_REGION') ?? 'ap-south-1',
    endpoint: env('MARKETING_S3_ENDPOINT') ?? (env('MARKETING_S3_BUCKET_NAME') ? undefined : env('S3_ENDPOINT')),
    // Media CDN (Cloudflare Worker in front of the private marketing bucket), e.g. https://media.byajbazaar.com.
    // Set: stable cached URLs for images and videos. Unset: signed B2 URLs, as before.
    imageCdnUrl: env('MARKETING_MEDIA_CDN_URL')?.replace(/\/+$/, ''),
    cdnPrefixes: MARKETING_MEDIA_CDN_PREFIXES,
  };

  readonly queue = {
    url: (env('MARKETING_QSTASH_URL') ?? 'https://qstash.upstash.io').replace(/\/+$/, ''),
    token: env('MARKETING_QSTASH_TOKEN'),
    currentSigningKey: env('MARKETING_QSTASH_CURRENT_SIGNING_KEY'),
    nextSigningKey: env('MARKETING_QSTASH_NEXT_SIGNING_KEY'),
  };

  /** Public API base (https://api.example.com) — QStash and the Kaggle notebook call back here. */
  readonly publicApiBaseUrl = env('MARKETING_API_BASE_URL')?.replace(/\/+$/, '');

  /** Async worker Lambda for long steps (image model). Unset = run in-process. */
  /** Worker Lambda; on Lambda it defaults to this service's `marketingWorker` function (same name prefix). */
  readonly workerLambdaName =
    env('MARKETING_INLINE') === 'true'
      ? undefined
      : (env('MARKETING_LAMBDA_NAME') ??
        env('AWS_LAMBDA_FUNCTION_NAME')?.replace(/-[A-Za-z0-9]+$/, '-marketingWorker'));

  /** wss:// URL of the API Gateway WebSocket the notebook streams progress to. */
  readonly websocketUrl = env('WEBSOCKET_API_URL');

  /**
   * Encrypts secrets stored in the marketing database (Kaggle API keys — accounts are managed through the admin
   * endpoints, not env vars). Falls back to TOKEN_SECRET; changing it makes stored keys unreadable.
   */
  readonly credentialsSecret = env('MARKETING_CREDENTIALS_SECRET') ?? env('TOKEN_SECRET');
  /**
   * Instagram API with Unified Login (Facebook Login for Business + an "Instagram Login Compatible" configuration).
   * Uses the Meta app ID / secret (not the Instagram app ID) and the configuration ID from the App Dashboard.
   */
  readonly instagram = {
    appId: env('MARKETING_INSTAGRAM_APP_ID') ?? env('META_APP_ID'),
    appSecret: env('MARKETING_INSTAGRAM_APP_SECRET') ?? env('META_APP_SECRET'),
    configId: env('MARKETING_INSTAGRAM_CONFIG_ID'),
    webhookVerifyToken: env('MARKETING_INSTAGRAM_WEBHOOK_VERIFY_TOKEN'),
    redirectUri: env('MARKETING_INSTAGRAM_REDIRECT_URI'),
    returnUrl: env('MARKETING_INSTAGRAM_RETURN_URL'),
    graphApiVersion: env('MARKETING_INSTAGRAM_GRAPH_API_VERSION') ?? 'v27.0',
  };
  readonly kaggleMachineShape = env('KAGGLE_MACHINE_SHAPE') ?? 'NvidiaTeslaT4';
  /**
   * Hugging Face token (read access) of an account that accepted the FLUX.2 [klein] 9B licence: the image notebooks
   * then paint with 9B. Without it they use the open 4B model. Passed into the private Kaggle notebooks.
   */
  readonly huggingFaceToken = env('MARKETING_HF_TOKEN');
  /** Kaggle's GPU session limit; the notebook hands over to a new session before reaching it. */
  readonly kaggleSessionHours = Number(env('KAGGLE_SESSION_HOURS') ?? 12) || 12;

  get queueEnabled(): boolean {
    return !!(this.queue.token && this.queue.currentSigningKey && this.publicApiBaseUrl);
  }
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
