import { generateLoggerConfig, UsersAuthOptions, type Environment } from '@shared-libs';
import { Algorithm } from 'jsonwebtoken';

import { IMsConfig } from './i-ms.config';
import { WebAppOptions, FileStorageOptions, GoogleOAuthOptions, RazorpayOptions } from '../application';
import {
  AESEncryptOptions,
  AIOptions,
  AivotTryOnOptions,
  CloudflareTryOnOptions,
  parseCloudflareCredentials,
  ResendOptions,
  RedisOptions,
  type TryOnAiProvider,
  AIVOT_TRYON_TIMEOUT_MS,
  AIVOT_TRYON_MAX_RETRIES,
  CLOUDFLARE_TRYON_MODEL,
  CLOUDFLARE_TRYON_TIMEOUT_MS,
  CLOUDFLARE_TRYON_MAX_RETRIES,
} from '../infrastructure';

function resolveTryOnProvider(): TryOnAiProvider {
  const explicit = (process.env.TRY_ON_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'aivot' || explicit === 'cloudflare') {
    return explicit;
  }
  if (process.env.TRYON_API_BASE_URL?.trim()) {
    return 'aivot';
  }
  if (process.env.CLOUDFLARE_ACCOUNT_ID?.trim() && process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    return 'cloudflare';
  }
  return 'cloudflare';
}

function resolveFileStorageOptions(): FileStorageOptions {
  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  return new FileStorageOptions(
    process.env.S3_AWS_ACCESS_KEY_ID || '',
    process.env.S3_AWS_SECRET_ACCESS_KEY || '',
    process.env.S3_BUCKET_NAME ?? 'jobs-file-storage',
    process.env.S3_BUCKET_REGION ?? 'ap-south-1',
    endpoint,
  );
}

function resolveRedisOptions(): RedisOptions | undefined {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    return undefined;
  }
  return new RedisOptions(
    url,
    Number(process.env.REDIS_MAX_RECONNECTION_ATTEMPTS ?? 10),
    Number(process.env.REDIS_RECONNECTION_DELAY_MS ?? 5000),
  );
}

export const configFactory = (): IMsConfig => ({
  logger: generateLoggerConfig(),
  apiConfig: {
    env: (process.env.NODE_ENV as Environment) ?? 'development',
    domain: process.env.API_DOMAIN ?? 'localhost',
    host: process.env.API_HOST ?? 'localhost',
    port: Number(process.env.API_PORT ?? 3000),
    globalPrefix: process.env.GLOBAL_PREFIX ?? 'api',
  },
  userJwt: new UsersAuthOptions(
    process.env.TOKEN_SECRET ?? 'dev-secret',
    process.env.TOKEN_AUDIENCE ?? 'usersAudience',
    process.env.TOKEN_ISSUER ?? 'UsersIssuer',
    (process.env.TOKEN_ALG as Algorithm) ?? 'HS256',
  ),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? 'postgres',
    database: process.env.DB_NAME ?? 'user_db',
  },
  fileStorage: resolveFileStorageOptions(),
  aes: new AESEncryptOptions(
    process.env.AES_KEY ?? '9/nQFoPsXm5iw8c1fOto/CgbZj6PmYevwdH0+Yc45Xw=',
    process.env.AES_ALGORITHM ?? 'aes-256-cbc',
  ),
  ai: new AIOptions(resolveTryOnProvider()),
  aivotTryOn: new AivotTryOnOptions(
    process.env.TRYON_API_BASE_URL?.trim() || '',
    Number(process.env.TRYON_API_TIMEOUT_MS) || AIVOT_TRYON_TIMEOUT_MS,
    Number(process.env.TRYON_API_MAX_RETRIES) || AIVOT_TRYON_MAX_RETRIES,
  ),
  cloudflareTryOn: new CloudflareTryOnOptions(
    parseCloudflareCredentials(process.env.CLOUDFLARE_ACCOUNT_ID || '', process.env.CLOUDFLARE_API_TOKEN || ''),
    process.env.CLOUDFLARE_TRYON_MODEL?.trim() || CLOUDFLARE_TRYON_MODEL,
    Number(process.env.CLOUDFLARE_TRYON_TIMEOUT_MS) || CLOUDFLARE_TRYON_TIMEOUT_MS,
    Number(process.env.CLOUDFLARE_TRYON_MAX_RETRIES) || CLOUDFLARE_TRYON_MAX_RETRIES,
  ),
  resend: new ResendOptions(
    process.env.RESEND_API_KEY ?? '',
    process.env.RESEND_SENDER ?? '',
    process.env.RESEND_SENDER_NAME ?? '',
  ),
  webApp: new WebAppOptions(process.env.WEB_APP_DOMAIN),
  googleOAuth: new GoogleOAuthOptions(
    process.env.GOOGLE_CLIENT_ID ?? '',
    process.env.GOOGLE_CLIENT_SECRET ?? '',
    process.env.GOOGLE_REDIRECT_URI,
    (process.env.GOOGLE_MOBILE_CLIENT_ID ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  ),
  razorpay: new RazorpayOptions(
    process.env.RAZORPAY_KEY_ID ?? '',
    process.env.RAZORPAY_KEY_SECRET ?? '',
    process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
    'INR',
    Number(process.env.DEFAULT_TRIAL_DAYS ?? 7),
  ),
  redis: resolveRedisOptions(),
});
