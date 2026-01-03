import { UsersAuthOptions, IDbOptions } from '@shared-libs';
import { IApiOptions } from './i-api.options';
import { AESEncryptOptions, LambdaOptions, AIOptions, TwilioOptions } from '../infrastructure';
import { FileStorageOptions } from '../application';

export interface IMsConfig {
  apiConfig: IApiOptions;
  userJwt: UsersAuthOptions;
  database: IDbOptions;
  fileStorage: FileStorageOptions;
  aes: AESEncryptOptions;
  lambda: LambdaOptions;
  ai: AIOptions;
  twilio: TwilioOptions;
  webAppDomain: string;
}
