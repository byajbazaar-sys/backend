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
  webApp: WebAppOptions;
  googleOAuth: GoogleOAuthOptions;
  logger: Params;
}
