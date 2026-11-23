import { Injectable } from '@nestjs/common';

import { MarketingInstagramConnectionEntity } from './entities';
import { MarketingDatabase } from './marketing-database';
import { returnedRows } from './returned-rows';
import { MarketingInstagramConnection, IMarketingInstagramRepository } from '../../application';

@Injectable()
export class MarketingInstagramRepository implements IMarketingInstagramRepository {
  constructor(private readonly db: MarketingDatabase) {}

  async saveOAuthState(userId: string, stateHash: string, expiresAt: Date): Promise<void> {
    const repository = await this.db.repository(MarketingInstagramConnectionEntity);
    await repository.upsert({ userId, oauthStateHash: stateHash, oauthStateExpiresAt: expiresAt }, ['userId']);
  }

  async consumeOAuthState(stateHash: string, now: Date): Promise<string | null> {
    const result: unknown = await (
      await this.db.connection()
    ).query(
      `UPDATE "marketing_instagram_connections"
       SET "oauth_state_hash" = NULL, "oauth_state_expires_at" = NULL, "updated_at" = $2
       WHERE "oauth_state_hash" = $1 AND "oauth_state_expires_at" > $2
       RETURNING "user_id"`,
      [stateHash, now],
    );
    const userId = returnedRows(result)[0]?.user_id;
    return typeof userId === 'string' ? userId : null;
  }

  async saveConnection(connection: MarketingInstagramConnection): Promise<void> {
    const repository = await this.db.repository(MarketingInstagramConnectionEntity);
    await repository.upsert(
      {
        ...connection,
        // A (re)connected account gets its messaging Page looked up again (it may be another account or Page).
        messagingPageId: connection.messagingPageId ?? null,
        messagingTokenEncrypted: connection.messagingTokenEncrypted ?? null,
        oauthStateHash: null,
        oauthStateExpiresAt: null,
      },
      ['userId'],
    );
  }

  async findConnection(userId: string): Promise<MarketingInstagramConnection | null> {
    return this.toConnection(
      await (await this.db.repository(MarketingInstagramConnectionEntity)).findOneBy({ userId }),
    );
  }

  async findByInstagramUserId(instagramUserId: string): Promise<MarketingInstagramConnection | null> {
    return this.toConnection(
      await (await this.db.repository(MarketingInstagramConnectionEntity)).findOneBy({ instagramUserId }),
    );
  }

  async saveMessaging(userId: string, pageId: string | null, tokenEncrypted: string | null): Promise<void> {
    await (
      await this.db.repository(MarketingInstagramConnectionEntity)
    ).update({ userId }, { messagingPageId: pageId, messagingTokenEncrypted: tokenEncrypted });
  }

  private toConnection(connection: MarketingInstagramConnectionEntity | null): MarketingInstagramConnection | null {
    if (
      !connection?.instagramUserId ||
      !connection.username ||
      !connection.accessTokenEncrypted ||
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
      messagingPageId: connection.messagingPageId,
      messagingTokenEncrypted: connection.messagingTokenEncrypted,
    };
  }

  async deleteConnection(userId: string): Promise<void> {
    await (await this.db.repository(MarketingInstagramConnectionEntity)).delete({ userId });
  }
}
