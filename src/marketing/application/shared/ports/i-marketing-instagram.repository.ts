import { MarketingInstagramConnection } from '../domain';

export const MARKETING_INSTAGRAM_REPOSITORY = 'MARKETING_INSTAGRAM_REPOSITORY';

export interface IMarketingInstagramRepository {
  saveOAuthState(userId: string, stateHash: string, expiresAt: Date): Promise<void>;
  consumeOAuthState(stateHash: string, now: Date): Promise<string | null>;
  saveConnection(connection: MarketingInstagramConnection): Promise<void>;
  findConnection(userId: string): Promise<MarketingInstagramConnection | null>;
  deleteConnection(userId: string): Promise<void>;
}
