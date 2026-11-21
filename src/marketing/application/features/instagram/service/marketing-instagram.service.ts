import { ConflictException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { MarketingConfig } from '../../../../marketing.config';
import {
  IInstagramGraphClient,
  INSTAGRAM_GRAPH_CLIENT,
  InstagramPlace,
  InstagramPostOptions,
  IMarketingInstagramRepository,
  MARKETING_INSTAGRAM_REPOSITORY,
  IMarketingSecretCipher,
  MARKETING_SECRET_CIPHER,
} from '../../../shared';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
/**
 * How long Instagram may take to process a post's videos (one reel, or every video of a carousel together) before
 * publishing gives up — inside the publisher Lambda's 300 s.
 */
const PROCESSING_TIMEOUT_MS = 230_000;
const STATUS_POLL_MS = 5_000;

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

  /**
   * Publishes one photo, one reel, or a carousel of 2–10 photos / videos, then applies the after-publish options
   * (comments off, first comment). Those two never fail the post: what did not go through comes back in `warnings`.
   */
  async publishPost(
    userId: string,
    post: {
      mediaType: 'IMAGE' | 'REEL' | 'CAROUSEL';
      items: { mediaType: 'IMAGE' | 'REEL'; url: string }[];
      caption: string;
      options?: InstagramPostOptions | null;
    },
  ): Promise<{ mediaId: string; warnings: string[] }> {
    const { accessToken, instagramUserId } = await this.publishingAccount(userId);
    const deadline = Date.now() + PROCESSING_TIMEOUT_MS;
    let containerId: string;

    if (post.mediaType === 'CAROUSEL') {
      const children: string[] = [];
      for (const item of post.items) {
        const child = await this.instagram.createMediaContainer({
          accessToken,
          instagramUserId,
          mediaType: item.mediaType,
          mediaUrl: item.url,
          caption: '',
          options: post.options,
          carouselItem: true,
        });
        if (item.mediaType === 'REEL') await this.waitUntilProcessed(accessToken, child, deadline);
        children.push(child);
      }
      containerId = await this.instagram.createCarouselContainer({
        accessToken,
        instagramUserId,
        children,
        caption: post.caption,
        options: post.options,
      });
      await this.waitUntilProcessed(accessToken, containerId, deadline);
    } else {
      const item = post.items[0];
      if (!item) throw new Error('Nothing to publish.');
      containerId = await this.instagram.createMediaContainer({
        accessToken,
        instagramUserId,
        mediaType: item.mediaType,
        mediaUrl: item.url,
        caption: post.caption,
        options: post.options,
      });
      if (item.mediaType === 'REEL') await this.waitUntilProcessed(accessToken, containerId, deadline);
    }

    const mediaId = await this.instagram.publishContainer(accessToken, instagramUserId, containerId);

    const warnings: string[] = [];
    if (post.options?.commentsDisabled) {
      try {
        await this.instagram.setCommentsEnabled(accessToken, mediaId, false);
      } catch (err) {
        this.logger.warn({ userId, mediaId, err: describeError(err) }, 'Could not turn off comments');
        warnings.push('Comments could not be turned off — change it in the Instagram app.');
      }
    }
    const firstComment = post.options?.firstComment?.trim();
    if (firstComment && !post.options?.commentsDisabled) {
      try {
        await this.instagram.createComment(accessToken, mediaId, firstComment);
      } catch (err) {
        this.logger.warn({ userId, mediaId, err: describeError(err) }, 'Could not add the first comment');
        warnings.push('The first comment could not be added.');
      }
    }
    return { mediaId, warnings };
  }

  /** Places to tag; `available: false` when the Meta app may not search Pages (then a place ID is typed in). */
  async searchPlaces(userId: string, query: string): Promise<{ available: boolean; places: InstagramPlace[] }> {
    const { accessToken } = await this.publishingAccount(userId);
    try {
      return { available: true, places: (await this.instagram.searchPlaces(accessToken, query)).slice(0, 15) };
    } catch (err) {
      this.logger.info({ userId, err: describeError(err) }, 'Instagram place search is not available');
      return { available: false, places: [] };
    }
  }

  private async publishingAccount(userId: string): Promise<{ accessToken: string; instagramUserId: string }> {
    const connection = await this.connections.findConnection(userId);
    if (!connection || isExpired(connection.tokenExpiresAt)) {
      throw new ConflictException('Reconnect your Instagram account to publish scheduled posts.');
    }
    return {
      accessToken: this.cipher.decrypt(connection.accessTokenEncrypted),
      instagramUserId: connection.instagramUserId,
    };
  }

  private async waitUntilProcessed(accessToken: string, containerId: string, deadline: number): Promise<void> {
    while (true) {
      const statusCode = await this.instagram.containerStatus(accessToken, containerId);
      if (statusCode === 'FINISHED') return;
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        throw new Error(`Instagram media processing ended with status ${statusCode}.`);
      }
      if (Date.now() >= deadline) throw new Error('Instagram media processing timed out.');
      await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_MS));
    }
  }

  async finishConnection(
    state: string | undefined,
    code: string | undefined,
    providerError?: string,
    providerErrorDetail?: string,
  ): Promise<InstagramOAuthOutcome> {
    // Never log the code or state themselves: only whether they arrived.
    const received = { hasState: !!state, hasCode: !!code, error: providerError, errorDetail: providerErrorDetail };
    if (!state) {
      this.logger.warn(received, 'Instagram callback without state');
      return 'failed';
    }
    const userId = await this.connections.consumeOAuthState(stateDigest(state), new Date());
    if (!userId) {
      this.logger.warn(
        received,
        'Instagram callback state is unknown or expired (older than 10 min, or Connect was clicked again)',
      );
      return 'failed';
    }
    if (providerError) {
      this.logger.info({ userId, ...received }, 'Instagram login was cancelled or refused at Meta');
      return 'cancelled';
    }
    if (!code) {
      this.logger.warn({ userId, ...received }, 'Instagram callback without code');
      return 'failed';
    }

    try {
      this.requireConfiguration();
      const token = await this.instagram.exchangeCode(code.replace(/#_$/, ''));
      // What Meta actually granted (permissions + the Instagram / Page / business IDs each covers): explains
      // "Requires instagram_basic permission" style failures. Best effort; never logs the token.
      const granted = await this.instagram.inspectToken(token.accessToken).catch((err: unknown) => ({
        inspectFailed: describeError(err),
      }));
      this.logger.info({ userId, granted }, 'Instagram Unified Login token granted');
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
      this.logger.info(
        { userId, username: account.username, expiresIn: token.expiresIn },
        'Instagram connected via Unified Login',
      );
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
