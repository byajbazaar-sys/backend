import { UsersAuthOptions, IDbOptions } from '@shared-libs';
import { IApiOptions } from './i-api.options';
import { WebAppOptions } from '../application';
import {
  AESEncryptOptions,
  LambdaOptions,
  AIOptions,
  TwilioOptions,
  SendGridOptions,
} from '../infrastructure';
import { FileStorageOptions } from '../application';
import { Params } from 'nestjs-pino';

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
  webApp: WebAppOptions;
  logger: Params;
}
