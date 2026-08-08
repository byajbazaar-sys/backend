import { ApiConfiguration } from '../domain';

export interface ApiCredentialsGenerateResult {
  apiKey: string;
  apiSecret: string;
  configuration: ApiConfiguration;
}
