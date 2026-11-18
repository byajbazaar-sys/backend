import { Injectable } from '@nestjs/common';
import axios from 'axios';

import { InstagramProfile, IInstagramGraphClient } from '../../application';
import { MarketingConfig } from '../../marketing.config';

/**
 * Instagram API with Unified Login: the client logs in with Instagram or Facebook through the Facebook Login for
 * Business dialog (an "Instagram Login Compatible" configuration), and every API call goes to graph.facebook.com with
 * a Business Integration System User token and the client's Instagram account ID.
 */
const FACEBOOK_DIALOG_URL = 'https://www.facebook.com';
const FACEBOOK_GRAPH_URL = 'https://graph.facebook.com';

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Instagram Unified Login + Instagram content publishing over graph.facebook.com (axios). */
@Injectable()
export class InstagramGraphClient implements IInstagramGraphClient {
  constructor(private readonly config: MarketingConfig) {}

  private get graphUrl(): string {
    return `${FACEBOOK_GRAPH_URL}/${this.config.instagram.graphApiVersion}`;
  }

  authorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.instagram.appId ?? '',
      config_id: this.config.instagram.configId ?? '',
      redirect_uri: this.config.instagram.redirectUri ?? '',
      response_type: 'code',
      override_default_response_type: 'true',
      display: 'page',
      state,
    });
    return `${FACEBOOK_DIALOG_URL}/${this.config.instagram.graphApiVersion}/dialog/oauth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<{ accessToken: string; expiresIn: number | null }> {
    const response = await axios.get(`${this.graphUrl}/oauth/access_token`, {
      params: {
        client_id: this.config.instagram.appId,
        client_secret: this.config.instagram.appSecret,
        redirect_uri: this.config.instagram.redirectUri,
        code,
      },
      timeout: 15_000,
    });
    const data = asRecord(response.data);
    const accessToken = asString(data.access_token);
    if (!accessToken) throw new Error('Instagram code exchange failed');
    const expiresIn = Number(data.expires_in);
    return { accessToken, expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : null };
  }

  async getAssignedAccounts(accessToken: string): Promise<InstagramProfile[]> {
    const response = await axios.get(`${this.graphUrl}/me/assigned_instagram_accounts`, {
      params: { fields: 'id,username', access_token: accessToken },
      timeout: 15_000,
    });
    const data = asRecord(response.data).data;
    return (Array.isArray(data) ? data : [])
      .map((item) => {
        const record = asRecord(item);
        return { id: asString(record.id), username: asString(record.username) };
      })
      .filter((account): account is InstagramProfile => !!account.id && !!account.username);
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
