import { Environment } from '@shared-libs';

export interface IApiOptions {
  env: Environment;
  domain: string;
  host: string;
  port: number;
  globalPrefix: string;
}
