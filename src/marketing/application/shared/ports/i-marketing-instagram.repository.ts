import { MarketingInstagramConnection } from '../domain';

export const MARKETING_INSTAGRAM_REPOSITORY = 'MARKETING_INSTAGRAM_REPOSITORY';

export interface IMarketingInstagramRepository {
  saveOAuthState(userId: string, stateHash: string, expiresAt: Date): Promise<void>;
  consumeOAuthState(stateHash: string, now: Date): Promise<string | null>;
  saveConnection(connection: MarketingInstagramConnection): Promise<void>;
  findConnection(userId: string): Promise<MarketingInstagramConnection | null>;
  /** The connection of the Instagram professional account a message webhook names (its IG user ID). */
  findByInstagramUserId(instagramUserId: string): Promise<MarketingInstagramConnection | null>;
  /** The Page used for Instagram DMs (null clears it, e.g. after it stopped working). */
  saveMessaging(userId: string, pageId: string | null, tokenEncrypted: string | null): Promise<void>;
  deleteConnection(userId: string): Promise<void>;
}
