import { Injectable } from '@nestjs/common';

import { MarketingInstagramConnectionEntity } from './entities/marketing.entities';
import { MarketingDatabase } from './marketing-database';
import { IMarketingInstagramRepository, MarketingInstagramConnection } from '../../application/ports';

@Injectable()
export class MarketingInstagramRepository implements IMarketingInstagramRepository {
  constructor(private readonly db: MarketingDatabase) {}

  async saveOAuthState(userId: string, stateHash: string, expiresAt: Date): Promise<void> {
    const repository = await this.db.repository(MarketingInstagramConnectionEntity);
    await repository.upsert({ userId, oauthStateHash: stateHash, oauthStateExpiresAt: expiresAt }, ['userId']);
  }

  async consumeOAuthState(stateHash: string, now: Date): Promise<string | null> {
    const rows = await (
      await this.db.connection()
    ).query(
      `UPDATE "marketing_instagram_connections"
       SET "oauth_state_hash" = NULL, "oauth_state_expires_at" = NULL, "updated_at" = $2
       WHERE "oauth_state_hash" = $1 AND "oauth_state_expires_at" > $2
       RETURNING "user_id"`,
      [stateHash, now],
    );
    return rows[0]?.user_id ?? null;
  }

  async saveConnection(connection: MarketingInstagramConnection): Promise<void> {
    const repository = await this.db.repository(MarketingInstagramConnectionEntity);
    await repository.upsert(
      {
        ...connection,
        oauthStateHash: null,
        oauthStateExpiresAt: null,
      },
      ['userId'],
    );
  }

  async findConnection(userId: string): Promise<MarketingInstagramConnection | null> {
    const connection = await (await this.db.repository(MarketingInstagramConnectionEntity)).findOneBy({ userId });
    if (
      !connection?.instagramUserId ||
      !connection.username ||
      !connection.accessTokenEncrypted ||
      !connection.tokenExpiresAt ||
      !connection.connectedAt
    ) {
      return null;
    }
    return {
      userId: connection.userId,
      instagramUserId: connection.instagramUserId,
      username: connection.username,
      accessTokenEncrypted: connection.accessTokenEncrypted,
      tokenExpiresAt: connection.tokenExpiresAt,
      connectedAt: connection.connectedAt,
    };
  }

  async deleteConnection(userId: string): Promise<void> {
    await (await this.db.repository(MarketingInstagramConnectionEntity)).delete({ userId });
  }
}
