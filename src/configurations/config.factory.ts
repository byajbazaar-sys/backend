import { generateLoggerConfig, UsersAuthOptions, type Environment } from '@shared-libs';
import { Algorithm } from 'jsonwebtoken';
import { IMsConfig } from './i-ms.config';
import { WebAppOptions, FileStorageOptions, GoogleOAuthOptions, RazorpayOptions } from '../application';
import {
  AESEncryptOptions,
  LambdaOptions,
  AIOptions,
  AivotTryOnOptions,
  ReplicateTryOnOptions,
  CloudflareTryOnOptions,
  parseCloudflareCredentials,
  TwilioOptions,
  SendGridOptions,
  SesOptions,
  ResendOptions,
  type TryOnAiProvider,
  AIVOT_TRYON_TIMEOUT_MS,
  AIVOT_TRYON_MAX_RETRIES,
  REPLICATE_TRYON_MODEL,
  REPLICATE_TRYON_TIMEOUT_MS,
  REPLICATE_TRYON_MAX_RETRIES,
  CLOUDFLARE_TRYON_MODEL,
  CLOUDFLARE_TRYON_TIMEOUT_MS,
  CLOUDFLARE_TRYON_MAX_RETRIES,
} from '../infrastructure';

function resolveTryOnProvider(): TryOnAiProvider {
  const explicit = (process.env.TRY_ON_PROVIDER || '').trim().toLowerCase();
  if (
    explicit === 'aivot' ||
    explicit === 'gemini' ||
    explicit === 'bedrock' ||
    explicit === 'replicate' ||
    explicit === 'cloudflare'
  ) {
    return explicit;
  }
  if (process.env.TRYON_API_BASE_URL?.trim()) {
    return 'aivot';
  }
  if (
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() &&
    process.env.CLOUDFLARE_API_TOKEN?.trim()
  ) {
    return 'cloudflare';
  }
  if (process.env.REPLICATE_API_TOKEN?.trim()) {
    return 'replicate';
  }
  return process.env.AI_PROVIDER === 'gemini' ? 'gemini' : 'bedrock';
}

function resolveFileStorageOptions(): FileStorageOptions {
  const r2Endpoint = process.env.CLOUDFLARE_R2_ENDPOINT?.trim();
  return new FileStorageOptions(
    r2Endpoint
      ? process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || ''
      : process.env?.S3_AWS_ACCESS_KEY_ID || '',
    r2Endpoint
      ? process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || ''
      : process.env?.S3_AWS_SECRET_ACCESS_KEY || '',
    r2Endpoint
      ? process.env.CLOUDFLARE_R2_BUCKET || ''
      : process.env?.S3_BUCKET_NAME ?? 'jobs-file-storage',
    r2Endpoint ? 'auto' : process.env?.S3_BUCKET_REGION ?? 'ap-south-1',
    r2Endpoint,
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
  lambda: new LambdaOptions(
    process.env.LAMBDA_AWS_REGION ?? '',
    process.env.LAMBDA_AWS_ACCESS_KEY_ID ?? '',
    process.env.LAMBDA_AWS_SECRET_ACCESS_KEY ?? '',
  ),
  ai: new AIOptions(
    process.env.AI_OPENAI_API_KEY ?? '',
    process.env.AI_GEMINI_API_KEY ?? '',
    process.env.AI_CLAUDE_API_KEY ?? '',
    process.env.AI_PROVIDER === 'gemini' ? 'gemini' : 'bedrock',
    (process.env.GEMINI_API_KEYS || process.env.AI_GEMINI_API_KEY || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
    process.env.BEDROCK_AWS_REGION || process.env.AWS_REGION || 'ap-south-1',
    process.env.BEDROCK_MODEL_ID || 'global.amazon.nova-2-lite-v1:0',
    resolveTryOnProvider(),
  ),
  aivotTryOn: new AivotTryOnOptions(
    process.env.TRYON_API_BASE_URL?.trim() || '',
    Number(process.env.TRYON_API_TIMEOUT_MS) || AIVOT_TRYON_TIMEOUT_MS,
    Number(process.env.TRYON_API_MAX_RETRIES) || AIVOT_TRYON_MAX_RETRIES,
  ),
  replicateTryOn: new ReplicateTryOnOptions(
    process.env.REPLICATE_API_TOKEN?.trim() || '',
    process.env.REPLICATE_TRYON_MODEL?.trim() || REPLICATE_TRYON_MODEL,
    Number(process.env.REPLICATE_TRYON_TIMEOUT_MS) || REPLICATE_TRYON_TIMEOUT_MS,
    Number(process.env.REPLICATE_TRYON_MAX_RETRIES) || REPLICATE_TRYON_MAX_RETRIES,
  ),
  cloudflareTryOn: new CloudflareTryOnOptions(
    parseCloudflareCredentials(
      process.env.CLOUDFLARE_ACCOUNT_ID || '',
      process.env.CLOUDFLARE_API_TOKEN || '',
    ),
    process.env.CLOUDFLARE_TRYON_MODEL?.trim() || CLOUDFLARE_TRYON_MODEL,
    Number(process.env.CLOUDFLARE_TRYON_TIMEOUT_MS) || CLOUDFLARE_TRYON_TIMEOUT_MS,
    Number(process.env.CLOUDFLARE_TRYON_MAX_RETRIES) || CLOUDFLARE_TRYON_MAX_RETRIES,
    Number(process.env.CLOUDFLARE_TRYON_GUIDANCE) || 7.5,
  ),
  twilio: new TwilioOptions(
    process.env.TWILIO_ACCOUNT_SID ?? '',
    process.env.TWILIO_AUTH_TOKEN ?? '',
    process.env.TWILIO_PHONE_NUMBER ?? '',
  ),
  sendGrid: new SendGridOptions(
    process.env.SENDGRID_API_KEY ?? '',
    process.env.SENDGRID_SENDER ?? '',
    process.env.SENDGRID_SENDER_NAME ?? '',
  ),
  ses: new SesOptions(
    process.env.SES_AWS_REGION ?? process.env.S3_BUCKET_REGION ?? 'ap-south-1',
    process.env.SES_AWS_ACCESS_KEY_ID ?? process.env.S3_AWS_ACCESS_KEY_ID ?? '',
    process.env.SES_AWS_SECRET_ACCESS_KEY ?? process.env.S3_AWS_SECRET_ACCESS_KEY ?? '',
    process.env.SES_SENDER ?? '',
    process.env.SES_SENDER_NAME ?? '',
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
  ),
  razorpay: new RazorpayOptions(
    process.env.RAZORPAY_KEY_ID ?? '',
    process.env.RAZORPAY_KEY_SECRET ?? '',
    process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
    'INR',
    Number(process.env.DEFAULT_TRIAL_DAYS ?? 7),
  ),
});
