/** An Instagram professional account the client assigned to the app during Unified Login. */
export interface InstagramProfile {
  id: string;
  username: string;
}

/** What Meta granted with an access token (from debug_token); used to explain failed connections. */
export interface InstagramTokenInfo {
  type?: string;
  isValid: boolean;
  appId?: string;
  /** Unix seconds; null / 0 when the token does not expire. */
  expiresAt: number | null;
  scopes: string[];
  /** Per permission, the asset IDs (Instagram accounts, Pages, businesses) it covers. */
  granularScopes: { scope: string; targetIds: string[] }[];
}
