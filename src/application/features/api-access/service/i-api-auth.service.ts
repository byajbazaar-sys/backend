import { IIdentity } from '@shared-libs';

import { ApiConfiguration } from '../domain';
import { ApiCredentialsGenerateResult } from './api-credentials-generate-result';
import { ApiTokenExchangeResult } from './api-token-exchange-result';

export const API_AUTH_SERVICE = 'API_AUTH_SERVICE';

export const API_ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface IApiAuthService {
  exchangeCredentials(apiKey: string, apiSecret: string): Promise<ApiTokenExchangeResult>;
  validateAccessToken(accessToken: string): Promise<IIdentity>;
  getConfiguration(userId: string): Promise<ApiConfiguration>;
  generateCredentials(userId: string, confirmRegenerate?: boolean): Promise<ApiCredentialsGenerateResult>;
  updateStatus(userId: string, isActive: boolean): Promise<ApiConfiguration>;
  deleteCredentials(userId: string): Promise<void>;
}
