import { ConflictException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { MarketingConfig } from '../../../../marketing.config';
import {
  IInstagramGraphClient,
  INSTAGRAM_GRAPH_CLIENT,
  IMarketingInstagramRepository,
  MARKETING_INSTAGRAM_REPOSITORY,
  IMarketingSecretCipher,
  MARKETING_SECRET_CIPHER,
} from '../../../shared';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
/** How long a reel may take to process on Instagram before publishing gives up. */
const REEL_PROCESSING_TIMEOUT_MS = 210_000;
const REEL_STATUS_POLL_MS = 5_000;

type InstagramOAuthOutcome = 'connected' | 'cancelled' | 'failed';

function stateDigest(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

@Injectable()
export class MarketingInstagramService {
  constructor(
    private readonly config: MarketingConfig,
    @Inject(MARKETING_SECRET_CIPHER) private readonly cipher: IMarketingSecretCipher,
    @Inject(INSTAGRAM_GRAPH_CLIENT) private readonly instagram: IInstagramGraphClient,
    @Inject(MARKETING_INSTAGRAM_REPOSITORY) private readonly connections: IMarketingInstagramRepository,
    @InjectPinoLogger(MarketingInstagramService.name) private readonly logger: PinoLogger,
  ) {}

  async beginConnection(userId: string): Promise<{ authorizationUrl: string }> {
    this.requireConfiguration();
    const state = randomBytes(32).toString('base64url');
    await this.connections.saveOAuthState(userId, stateDigest(state), new Date(Date.now() + OAUTH_STATE_TTL_MS));

    return { authorizationUrl: this.instagram.authorizationUrl(state) };
  }

  async status(userId: string): Promise<{
    connected: boolean;
    instagramUserId: string | null;
    username: string | null;
    tokenExpiresAt: Date | null;
    connectedAt: Date | null;
    requiresReconnect: boolean;
  }> {
    const connection = await this.connections.findConnection(userId);
    const requiresReconnect = !!connection && connection.tokenExpiresAt.getTime() <= Date.now();
    return {
      connected: !!connection && !requiresReconnect,
      instagramUserId: connection?.instagramUserId ?? null,
      username: connection?.username ?? null,
      tokenExpiresAt: connection?.tokenExpiresAt ?? null,
      connectedAt: connection?.connectedAt ?? null,
      requiresReconnect,
    };
  }

  async disconnect(userId: string): Promise<void> {
    await this.connections.deleteConnection(userId);
  }

  async publishMedia(userId: string, mediaType: 'IMAGE' | 'REEL', mediaUrl: string, caption: string): Promise<string> {
    const connection = await this.connections.findConnection(userId);
    if (!connection || connection.tokenExpiresAt.getTime() <= Date.now()) {
      throw new ConflictException('Reconnect your Instagram account to publish scheduled posts.');
    }
    const accessToken = this.cipher.decrypt(connection.accessTokenEncrypted);
    const containerId = await this.instagram.createMediaContainer({
      accessToken,
      instagramUserId: connection.instagramUserId,
      mediaType,
      mediaUrl,
      caption,
    });

    if (mediaType === 'REEL') {
      const deadline = Date.now() + REEL_PROCESSING_TIMEOUT_MS;
      while (true) {
        const statusCode = await this.instagram.containerStatus(accessToken, containerId);
        if (statusCode === 'FINISHED') break;
        if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
          throw new Error(`Instagram media processing ended with status ${statusCode}.`);
        }
        if (Date.now() >= deadline) throw new Error('Instagram media processing timed out.');
        await new Promise((resolve) => setTimeout(resolve, REEL_STATUS_POLL_MS));
      }
    }

    return this.instagram.publishContainer(accessToken, connection.instagramUserId, containerId);
  }

  async finishConnection(
    state: string | undefined,
    code: string | undefined,
    providerError?: string,
  ): Promise<InstagramOAuthOutcome> {
    if (!state) return 'failed';
    const userId = await this.connections.consumeOAuthState(stateDigest(state), new Date());
    if (!userId) return 'failed';
    if (providerError) return 'cancelled';
    if (!code) return 'failed';

    try {
      this.requireConfiguration();
      const shortToken = await this.instagram.exchangeCode(code.replace(/#_$/, ''));
      const longToken = await this.instagram.exchangeLongLivedToken(shortToken.accessToken);
      const profile = await this.instagram.getProfile(longToken.accessToken);
      const instagramUserId = profile.user_id ?? profile.id ?? shortToken.userId;
      const username = profile.username;
      if (!instagramUserId || !username) throw new Error('Instagram profile response was incomplete');

      const now = new Date();
      await this.connections.saveConnection({
        userId,
        instagramUserId: String(instagramUserId),
        username: String(username),
        accessTokenEncrypted: this.cipher.encrypt(longToken.accessToken),
        tokenExpiresAt: new Date(now.getTime() + longToken.expiresIn * 1000),
        connectedAt: now,
      });
      return 'connected';
    } catch {
      this.logger.warn({ userId }, 'Instagram Business Login could not be completed');
      return 'failed';
    }
  }

  private requireConfiguration(): void {
    const { appId, appSecret, redirectUri } = this.config.instagram;
    if (!appId || !appSecret || !redirectUri) {
      throw new ServiceUnavailableException(
        'Instagram Business Login is not configured. Set MARKETING_INSTAGRAM_APP_ID, MARKETING_INSTAGRAM_APP_SECRET, and MARKETING_INSTAGRAM_REDIRECT_URI.',
      );
    }
    if (!this.config.credentialsSecret) {
      throw new ServiceUnavailableException('Set MARKETING_CREDENTIALS_SECRET to encrypt Instagram access tokens.');
    }
    const callbackPath = '/api/v1/public/marketing/instagram/callback';
    let redirectPath: string;
    try {
      redirectPath = new URL(redirectUri).pathname.replace(/\/+$/, '');
    } catch {
      throw new ServiceUnavailableException('MARKETING_INSTAGRAM_REDIRECT_URI must be a valid absolute URL.');
    }
    if (redirectPath !== callbackPath) {
      throw new ServiceUnavailableException(
        `MARKETING_INSTAGRAM_REDIRECT_URI must point to the backend OAuth callback: ${callbackPath}.`,
      );
    }
  }
}
