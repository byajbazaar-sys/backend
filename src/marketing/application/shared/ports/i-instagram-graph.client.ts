import { InstagramProfile } from '../domain';

/** Instagram Business Login (OAuth) and the Instagram Graph content-publishing API. */
export const INSTAGRAM_GRAPH_CLIENT = 'INSTAGRAM_GRAPH_CLIENT';

export interface IInstagramGraphClient {
  authorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<{ accessToken: string; userId: string }>;
  exchangeLongLivedToken(accessToken: string): Promise<{ accessToken: string; expiresIn: number }>;
  getProfile(accessToken: string): Promise<InstagramProfile>;
  /** Creates a media container for an image or a reel; returns its ID. */
  createMediaContainer(input: {
    accessToken: string;
    instagramUserId: string;
    mediaType: 'IMAGE' | 'REEL';
    mediaUrl: string;
    caption: string;
  }): Promise<string>;
  /** Processing status of a container (IN_PROGRESS, FINISHED, ERROR, EXPIRED …). */
  containerStatus(accessToken: string, containerId: string): Promise<string | undefined>;
  /** Publishes a processed container; returns the published media ID. */
  publishContainer(accessToken: string, instagramUserId: string, containerId: string): Promise<string>;
}
