import { Params } from 'nestjs-pino';
import { UsersAuthOptions, IDbOptions } from '@shared-libs';
import { IApiOptions } from './i-api.options';
import { WebAppOptions, FileStorageOptions, GoogleOAuthOptions } from '../application';
import {
  AESEncryptOptions,
  LambdaOptions,
  AIOptions,
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
  twilio: TwilioOptions;
  sendGrid: SendGridOptions;
  ses: SesOptions;
  resend: ResendOptions;
  webApp: WebAppOptions;
  googleOAuth: GoogleOAuthOptions;
  logger: Params;
}
