import { InstagramProfile, InstagramTokenInfo } from '../domain';

/** Instagram API with Unified Login (OAuth via Facebook Login for Business) and content publishing. */
export const INSTAGRAM_GRAPH_CLIENT = 'INSTAGRAM_GRAPH_CLIENT';

export interface IInstagramGraphClient {
  authorizationUrl(state: string): string;
  /**
   * Exchanges the OAuth code for a Business Integration System User access token. `expiresIn` (seconds) is null
   * when the configuration issues tokens that never expire.
   */
  exchangeCode(code: string): Promise<{ accessToken: string; expiresIn: number | null }>;
  /** Permissions and asset IDs granted with a token (Meta debug_token). Never includes the token. */
  inspectToken(accessToken: string): Promise<InstagramTokenInfo>;
  /** The Instagram professional accounts the client assigned to the app (`/me/assigned_instagram_accounts`). */
  getAssignedAccounts(accessToken: string): Promise<InstagramProfile[]>;
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
