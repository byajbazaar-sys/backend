import { UsersAuthOptions, IDbOptions } from '@shared-libs';
import { Params } from 'nestjs-pino';

import { IApiOptions } from './i-api.options';
import { WebAppOptions, FileStorageOptions, GoogleOAuthOptions, RazorpayOptions, AppIntegrityOptions } from '../application';
import {
  AESEncryptOptions,
  AIOptions,
  AivotTryOnOptions,
  CloudflareTryOnOptions,
  ResendOptions,
  RedisOptions,
} from '../infrastructure';

export interface IMsConfig {
  apiConfig: IApiOptions;
  userJwt: UsersAuthOptions;
  database: IDbOptions;
  fileStorage: FileStorageOptions;
  aes: AESEncryptOptions;
  ai: AIOptions;
  aivotTryOn: AivotTryOnOptions;
  cloudflareTryOn: CloudflareTryOnOptions;
  resend: ResendOptions;
  webApp: WebAppOptions;
  googleOAuth: GoogleOAuthOptions;
  razorpay: RazorpayOptions;
  redis?: RedisOptions;
  appIntegrity: AppIntegrityOptions;
  logger: Params;
}
