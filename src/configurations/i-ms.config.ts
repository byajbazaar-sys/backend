import { Params } from 'nestjs-pino';
import { UsersAuthOptions, IDbOptions } from '@shared-libs';
import { IApiOptions } from './i-api.options';
import { WebAppOptions, FileStorageOptions, GoogleOAuthOptions, RazorpayOptions } from '../application';
import {
  AESEncryptOptions,
  LambdaOptions,
  AIOptions,
  AivotTryOnOptions,
  TwilioOptions,
  SendGridOptions,
  SesOptions,
  ResendOptions,
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
  twilio: TwilioOptions;
  sendGrid: SendGridOptions;
  ses: SesOptions;
  resend: ResendOptions;
  webApp: WebAppOptions;
  googleOAuth: GoogleOAuthOptions;
  razorpay: RazorpayOptions;
  logger: Params;
}
