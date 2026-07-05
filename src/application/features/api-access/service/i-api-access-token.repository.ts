import { ApiAccessToken } from '../domain';

export const API_ACCESS_TOKEN_REPOSITORY = 'API_ACCESS_TOKEN_REPOSITORY';

export interface IApiAccessTokenRepository {
  create(token: ApiAccessToken): Promise<ApiAccessToken>;
  findValidByHash(accessTokenHash: string): Promise<ApiAccessToken | null>;
  revokeAllByConfigurationId(apiConfigurationId: string): Promise<void>;
  touchLastUsed(id: string, at?: Date): Promise<void>;
}
