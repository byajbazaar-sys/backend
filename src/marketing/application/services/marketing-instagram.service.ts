import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { MarketingSecretCipher } from '../../infrastructure/crypto/marketing-secret.cipher';
import { MarketingConfig } from '../../marketing.config';
import { IMarketingInstagramRepository, MARKETING_INSTAGRAM_REPOSITORY } from '../ports';

const INSTAGRAM_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const INSTAGRAM_GRAPH_URL = 'https://graph.instagram.com';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const LONG_LIVED_TOKEN_SECONDS = 60 * 24 * 60 * 60;

type InstagramOAuthOutcome = 'connected' | 'cancelled' | 'failed';

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function responseRecord(value: unknown): Record<string, unknown> {
  const outer = asRecord(value);
  const data = outer.data;
  if (Array.isArray(data)) return asRecord(data[0]);
  return data && typeof data === 'object' ? asRecord(data) : outer;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function stateDigest(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

@Injectable()
export class MarketingInstagramService {
  constructor(
    private readonly config: MarketingConfig,
    private readonly cipher: MarketingSecretCipher,
    @Inject(MARKETING_INSTAGRAM_REPOSITORY) private readonly connections: IMarketingInstagramRepository,
    @InjectPinoLogger(MarketingInstagramService.name) private readonly logger: PinoLogger,
  ) {}

  async beginConnection(userId: string): Promise<{ authorizationUrl: string }> {
    this.requireConfiguration();
    const state = randomBytes(32).toString('base64url');
    await this.connections.saveOAuthState(userId, stateDigest(state), new Date(Date.now() + OAUTH_STATE_TTL_MS));

    const params = new URLSearchParams({
      client_id: this.config.instagram.appId,
      redirect_uri: this.config.instagram.redirectUri,
      response_type: 'code',
      scope: 'instagram_business_basic,instagram_business_content_publish',
      state,
      enable_fb_login: 'true',
    });
    return { authorizationUrl: `${INSTAGRAM_AUTHORIZE_URL}?${params.toString()}` };
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
      const shortToken = await this.exchangeCode(code.replace(/#_$/, ''));
      const longToken = await this.exchangeLongLivedToken(shortToken.accessToken);
      const profile = await this.getProfile(longToken.accessToken);
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
  }

  private async exchangeCode(code: string): Promise<{ accessToken: string; userId: string }> {
    const response = await axios.post(
      INSTAGRAM_TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.instagram.appId,
        client_secret: this.config.instagram.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: this.config.instagram.redirectUri,
        code,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 },
    );
    const data = responseRecord(response.data);
    const accessToken = typeof data.access_token === 'string' ? data.access_token : '';
    const userId = asString(data.user_id) ?? '';
    if (response.status >= 300 || !accessToken || !userId) throw new Error('Instagram code exchange failed');
    return { accessToken, userId };
  }

  private async exchangeLongLivedToken(accessToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    const response = await axios.get(`${INSTAGRAM_GRAPH_URL}/access_token`, {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: this.config.instagram.appSecret,
        access_token: accessToken,
      },
      timeout: 15_000,
    });
    const data = responseRecord(response.data);
    const token = typeof data.access_token === 'string' ? data.access_token : '';
    const expiresIn = Number(data.expires_in ?? LONG_LIVED_TOKEN_SECONDS);
    if (response.status >= 300 || !token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new Error('Instagram long-lived token exchange failed');
    }
    return { accessToken: token, expiresIn };
  }

  private async getProfile(accessToken: string): Promise<{ user_id?: string; id?: string; username?: string }> {
    const response = await axios.get(`${INSTAGRAM_GRAPH_URL}/${this.config.instagram.graphApiVersion}/me`, {
      params: { fields: 'user_id,username', access_token: accessToken },
      timeout: 15_000,
    });
    const data = responseRecord(response.data);
    if (response.status >= 300) throw new Error('Instagram profile request failed');
    return {
      user_id: asString(data.user_id),
      id: asString(data.id),
      username: asString(data.username),
    };
  }
}
