import { Injectable } from '@nestjs/common';
import axios from 'axios';

import {
  InstagramPlace,
  InstagramPostOptions,
  InstagramProfile,
  InstagramTokenInfo,
  IInstagramGraphClient,
} from '../../application';
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

/** A photo tag: Instagram needs a position; untagged spots default to the centre. */
function positionedTag(tag: { username: string; x?: number; y?: number }): { username: string; x: number; y: number } {
  const clamp = (n: number | undefined) => Math.min(1, Math.max(0, n ?? 0.5));
  return { username: tag.username, x: clamp(tag.x), y: clamp(tag.y) };
}

/** Location and collaborators — set on the post itself (single photo, reel or carousel parent). */
function sharedPostParams(options: InstagramPostOptions): Record<string, string> {
  const params: Record<string, string> = {};
  if (options.locationId?.trim()) params.location_id = options.locationId.trim();
  const collaborators = (options.collaborators ?? []).filter(Boolean).slice(0, 3);
  if (collaborators.length) params.collaborators = JSON.stringify(collaborators);
  return params;
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

  /**
   * What Meta granted with a token (debug_token, called with the app token): its type, permissions and the asset IDs
   * each permission covers. For diagnostics only: the token itself is never returned or logged.
   */
  async inspectToken(accessToken: string): Promise<InstagramTokenInfo> {
    const response = await axios.get(`${this.graphUrl}/debug_token`, {
      params: {
        input_token: accessToken,
        access_token: `${this.config.instagram.appId}|${this.config.instagram.appSecret}`,
      },
      timeout: 15_000,
    });
    const data = asRecord(asRecord(response.data).data);
    const granular = Array.isArray(data.granular_scopes) ? data.granular_scopes : [];
    return {
      type: asString(data.type),
      isValid: data.is_valid === true,
      appId: asString(data.app_id),
      expiresAt: Number(data.expires_at) || null,
      scopes: (Array.isArray(data.scopes) ? data.scopes : []).map(asString).filter((s): s is string => !!s),
      granularScopes: granular.map((g) => {
        const record = asRecord(g);
        return {
          scope: asString(record.scope) ?? '',
          targetIds: (Array.isArray(record.target_ids) ? record.target_ids : [])
            .map(asString)
            .filter((s): s is string => !!s),
        };
      }),
    };
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
    options?: InstagramPostOptions | null;
    carouselItem?: boolean;
  }): Promise<string> {
    const options = input.options ?? {};
    const params: Record<string, string> = { access_token: input.accessToken };
    const tags = (options.userTags ?? []).filter((tag) => tag.username);

    if (input.carouselItem) {
      // Carousel children carry only the media (and photo tags); caption, location and collaborators go on the parent.
      params.is_carousel_item = 'true';
      if (input.mediaType === 'IMAGE') {
        params.image_url = input.mediaUrl;
        if (tags.length) params.user_tags = JSON.stringify(tags.map(positionedTag));
      } else {
        params.media_type = 'VIDEO';
        params.video_url = input.mediaUrl;
      }
    } else if (input.mediaType === 'IMAGE') {
      params.image_url = input.mediaUrl;
      params.caption = input.caption;
      if (tags.length) params.user_tags = JSON.stringify(tags.map(positionedTag));
      if (options.altText?.trim()) params.alt_text = options.altText.trim();
      Object.assign(params, sharedPostParams(options));
    } else {
      params.media_type = 'REELS';
      params.video_url = input.mediaUrl;
      params.caption = input.caption;
      params.share_to_feed = options.shareToFeed === false ? 'false' : 'true';
      if (tags.length) params.user_tags = JSON.stringify(tags.map((tag) => ({ username: tag.username })));
      if (options.audioName?.trim()) params.audio_name = options.audioName.trim();
      if (options.thumbOffsetMs !== undefined && options.thumbOffsetMs >= 0) {
        params.thumb_offset = String(Math.round(options.thumbOffsetMs));
      }
      Object.assign(params, sharedPostParams(options));
    }

    return this.createContainer(input.instagramUserId, params);
  }

  async createCarouselContainer(input: {
    accessToken: string;
    instagramUserId: string;
    children: string[];
    caption: string;
    options?: InstagramPostOptions | null;
  }): Promise<string> {
    return this.createContainer(input.instagramUserId, {
      access_token: input.accessToken,
      media_type: 'CAROUSEL',
      children: input.children.join(','),
      caption: input.caption,
      ...sharedPostParams(input.options ?? {}),
    });
  }

  async setCommentsEnabled(accessToken: string, mediaId: string, enabled: boolean): Promise<void> {
    await axios.post(`${this.graphUrl}/${mediaId}`, null, {
      params: { comment_enabled: enabled ? 'true' : 'false', access_token: accessToken },
      timeout: 20_000,
    });
  }

  async createComment(accessToken: string, mediaId: string, message: string): Promise<void> {
    await axios.post(`${this.graphUrl}/${mediaId}/comments`, null, {
      params: { message, access_token: accessToken },
      timeout: 20_000,
    });
  }

  async searchPlaces(accessToken: string, query: string): Promise<InstagramPlace[]> {
    const response = await axios.get(`${this.graphUrl}/pages/search`, {
      params: { q: query, fields: 'id,name,location{street,city,state,country}', access_token: accessToken },
      timeout: 15_000,
    });
    const data = asRecord(response.data).data;
    return (
      (Array.isArray(data) ? data : [])
        .map((item) => {
          const record = asRecord(item);
          const location = asRecord(record.location);
          const address = [location.street, location.city, location.state, location.country]
            .map(asString)
            .filter(Boolean)
            .join(', ');
          return { id: asString(record.id), name: asString(record.name), address: address || undefined };
        })
        // Only Pages with an address can be used as a location.
        .filter((place): place is InstagramPlace & { address: string } => !!place.id && !!place.name && !!place.address)
    );
  }

  private async createContainer(instagramUserId: string, params: Record<string, string>): Promise<string> {
    const created = await axios.post(`${this.graphUrl}/${instagramUserId}/media`, null, { params, timeout: 30_000 });
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
