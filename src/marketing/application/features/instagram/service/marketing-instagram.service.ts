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

/** A null expiry means the Unified Login configuration issues tokens that never expire. */
function isExpired(expiresAt: Date | null): boolean {
  return !!expiresAt && expiresAt.getTime() <= Date.now();
}

/** Graph API error details (never the token) for the log. */
function describeError(err: unknown): unknown {
  const response = (err as { response?: { status?: number; data?: unknown } })?.response;
  if (response) return { status: response.status, body: response.data };
  return err instanceof Error ? err.message : 'Unknown error';
}

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
    const requiresReconnect = !!connection && isExpired(connection.tokenExpiresAt);
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
    if (!connection || isExpired(connection.tokenExpiresAt)) {
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
      const token = await this.instagram.exchangeCode(code.replace(/#_$/, ''));
      const accounts = await this.instagram.getAssignedAccounts(token.accessToken);
      const account = accounts[0];
      if (!account) throw new Error('No Instagram professional account was assigned to the app during login');
      if (accounts.length > 1) {
        this.logger.info(
          { userId, accounts: accounts.map((a) => a.username) },
          'Several Instagram accounts assigned; using the first',
        );
      }

      const now = new Date();
      await this.connections.saveConnection({
        userId,
        instagramUserId: account.id,
        username: account.username,
        accessTokenEncrypted: this.cipher.encrypt(token.accessToken),
        tokenExpiresAt: token.expiresIn ? new Date(now.getTime() + token.expiresIn * 1000) : null,
        connectedAt: now,
      });
      return 'connected';
    } catch (err) {
      this.logger.warn({ userId, err: describeError(err) }, 'Instagram Unified Login could not be completed');
      return 'failed';
    }
  }

  private requireConfiguration(): void {
    const { appId, appSecret, configId, redirectUri } = this.config.instagram;
    if (!appId || !appSecret || !configId || !redirectUri) {
      throw new ServiceUnavailableException(
        'Instagram Unified Login is not configured. Set MARKETING_INSTAGRAM_APP_ID and MARKETING_INSTAGRAM_APP_SECRET (the Meta app ID / secret), MARKETING_INSTAGRAM_CONFIG_ID, and MARKETING_INSTAGRAM_REDIRECT_URI.',
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
