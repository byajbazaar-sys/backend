import { Injectable } from '@nestjs/common';
import axios from 'axios';

import { InstagramProfile, IInstagramGraphClient } from '../../application';
import { MarketingConfig } from '../../marketing.config';

const INSTAGRAM_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const INSTAGRAM_GRAPH_URL = 'https://graph.instagram.com';
const LONG_LIVED_TOKEN_SECONDS = 60 * 24 * 60 * 60;

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

/** Instagram Business Login + Graph API over HTTPS (axios). */
@Injectable()
export class InstagramGraphClient implements IInstagramGraphClient {
  constructor(private readonly config: MarketingConfig) {}

  private get graphUrl(): string {
    return `${INSTAGRAM_GRAPH_URL}/${this.config.instagram.graphApiVersion}`;
  }

  authorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.instagram.appId,
      redirect_uri: this.config.instagram.redirectUri,
      response_type: 'code',
      scope: 'instagram_business_basic,instagram_business_content_publish',
      state,
      enable_fb_login: 'true',
    });
    return `${INSTAGRAM_AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<{ accessToken: string; userId: string }> {
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

  async exchangeLongLivedToken(accessToken: string): Promise<{ accessToken: string; expiresIn: number }> {
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

  async getProfile(accessToken: string): Promise<InstagramProfile> {
    const response = await axios.get(`${this.graphUrl}/me`, {
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

  async createMediaContainer(input: {
    accessToken: string;
    instagramUserId: string;
    mediaType: 'IMAGE' | 'REEL';
    mediaUrl: string;
    caption: string;
  }): Promise<string> {
    const params: Record<string, string> = {
      access_token: input.accessToken,
      caption: input.caption,
      ...(input.mediaType === 'IMAGE'
        ? { image_url: input.mediaUrl }
        : { media_type: 'REELS', video_url: input.mediaUrl, share_to_feed: 'true' }),
    };
    const created = await axios.post(`${this.graphUrl}/${input.instagramUserId}/media`, null, {
      params,
      timeout: 30_000,
    });
    const containerId = asString(asRecord(created.data).id);
    if (!containerId) throw new Error('Instagram did not return a media container ID.');
    return containerId;
  }

  async containerStatus(accessToken: string, containerId: string): Promise<string | undefined> {
    const response = await axios.get(`${this.graphUrl}/${containerId}`, {
      params: { fields: 'status_code', access_token: accessToken },
      timeout: 20_000,
    });
    return asString(asRecord(response.data).status_code);
  }

  async publishContainer(accessToken: string, instagramUserId: string, containerId: string): Promise<string> {
    const published = await axios.post(`${this.graphUrl}/${instagramUserId}/media_publish`, null, {
      params: { creation_id: containerId, access_token: accessToken },
      timeout: 30_000,
    });
    const mediaId = asString(asRecord(published.data).id);
    if (!mediaId) throw new Error('Instagram did not return a published media ID.');
    return mediaId;
  }
}
