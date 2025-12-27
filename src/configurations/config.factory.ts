import { UsersAuthOptions, type Environment } from '@shared-libs';
import { Algorithm } from 'jsonwebtoken';
import { IMsConfig } from './i-ms.config';
import { AESEncryptOptions, FileStorageOptions, LambdaOptions, AIOptions, TwilioOptions } from '../infrastructure';

export const configFactory = (): IMsConfig => ({
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
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 27017),
    username: process.env.DB_USERNAME || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jobs_db',
  },
  fileStorage: new FileStorageOptions(
    process.env?.AWS_ACCESS_KEY_ID,
    process.env?.AWS_SECRET_ACCESS_KEY,
    process.env?.S3_BUCKET_NAME ?? 'jobs-file-storage',
    process.env?.S3_BUCKET_REGION ?? 'ap-south-1',
  ),
  aes: new AESEncryptOptions(
    process.env.AES_KEY ?? '9/nQFoPsXm5iw8c1fOto/CgbZj6PmYevwdH0+Yc45Xw=',
    process.env.AES_ALGORITHM ?? 'aes-256-cbc',
  ),
  lambda: new LambdaOptions(
    process.env.LAMBDA_AWS_REGION,
    process.env.LAMBDA_AWS_ACCESS_KEY_ID,
    process.env.LAMBDA_AWS_SECRET_ACCESS_KEY,
  ),
  ai: new AIOptions(process.env.AI_OPENAI_API_KEY, process.env.AI_GEMINI_API_KEY, process.env.AI_CLAUDE_API_KEY),
  twilio: new TwilioOptions(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
    process.env.TWILIO_PHONE_NUMBER,
  ),
  webAppDomain: process.env.WEB_APP_DOMAIN,
});
