import { InstagramPostOptions, InstagramProfile, InstagramTokenInfo } from '../domain';

/** A place a post can be tagged with (a Facebook Page with a location). */
export interface InstagramPlace {
  id: string;
  name: string;
  address?: string;
}

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
  /**
   * Creates a media container for an image or a reel (or, with `carouselItem`, one photo / video of a carousel —
   * no caption then); returns its ID.
   */
  createMediaContainer(input: {
    accessToken: string;
    instagramUserId: string;
    mediaType: 'IMAGE' | 'REEL';
    mediaUrl: string;
    caption: string;
    options?: InstagramPostOptions | null;
    carouselItem?: boolean;
  }): Promise<string>;
  /** Creates the carousel container from 2–10 finished item containers; returns its ID. */
  createCarouselContainer(input: {
    accessToken: string;
    instagramUserId: string;
    children: string[];
    caption: string;
    options?: InstagramPostOptions | null;
  }): Promise<string>;
  /** Turns comments on or off for a published post. */
  setCommentsEnabled(accessToken: string, mediaId: string, enabled: boolean): Promise<void>;
  /** Adds a comment (as the account) to a published post. */
  createComment(accessToken: string, mediaId: string, message: string): Promise<void>;
  /** Places matching a query (Pages search); needs the app's Page Public Metadata Access. */
  searchPlaces(accessToken: string, query: string): Promise<InstagramPlace[]>;
  /** Processing status of a container (IN_PROGRESS, FINISHED, ERROR, EXPIRED …). */
  containerStatus(accessToken: string, containerId: string): Promise<string | undefined>;
  /** Publishes a processed container; returns the published media ID. */
  publishContainer(accessToken: string, instagramUserId: string, containerId: string): Promise<string>;

  // ---------------------------------------------------------------- Instagram DMs (customer inbox)

  /** The Facebook Page linked to an Instagram professional account, with its Page token (DMs go through it). */
  findMessagingPage(
    accessToken: string,
    instagramUserId: string,
  ): Promise<{ pageId: string; pageToken: string } | null>;
  /** Subscribes the Page to the app's message webhooks (Instagram DMs then reach /webhooks/instagram). */
  subscribeMessaging(pageId: string, pageToken: string): Promise<void>;
  /**
   * Sends a DM and returns Meta's message ID. `humanAgent` uses Meta's HUMAN_AGENT tag: a person's reply up to
   * 7 days after the customer's last message (outside the normal 24 hours).
   */
  sendDirectMessage(pageToken: string, recipientId: string, text: string, humanAgent?: boolean): Promise<string | null>;
  /** The customer's Instagram name and username, when Meta allows it (null otherwise). */
  getMessagingProfile(
    pageToken: string,
    instagramScopedId: string,
  ): Promise<{ name?: string; username?: string } | null>;
}
