import { UsersAuthOptions, IDbOptions } from '@shared-libs';
import { Params } from 'nestjs-pino';

import { IApiOptions } from './i-api.options';
import { WebAppOptions, FileStorageOptions, GoogleOAuthOptions, RazorpayOptions } from '../application';
import {
  AESEncryptOptions,
  LambdaOptions,
  AIOptions,
  AivotTryOnOptions,
  ReplicateTryOnOptions,
  CloudflareTryOnOptions,
  TwilioOptions,
  SendGridOptions,
  SesOptions,
  ResendOptions,
  RedisOptions,
} from '../infrastructure';

export interface IMsConfig {
  apiConfig: IApiOptions;
  userJwt: UsersAuthOptions;
  database: IDbOptions;
  fileStorage: FileStorageOptions;
  aes: AESEncryptOptions;
  lambda: LambdaOptions;
  ai: AIOptions;
  aivotTryOn: AivotTryOnOptions;
  replicateTryOn: ReplicateTryOnOptions;
  cloudflareTryOn: CloudflareTryOnOptions;
  twilio: TwilioOptions;
  sendGrid: SendGridOptions;
  ses: SesOptions;
  resend: ResendOptions;
  webApp: WebAppOptions;
  googleOAuth: GoogleOAuthOptions;
  razorpay: RazorpayOptions;
  redis?: RedisOptions;
  logger: Params;
}
