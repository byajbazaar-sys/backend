export interface MarketingInstagramConnection {
  userId: string;
  instagramUserId: string;
  username: string;
  accessTokenEncrypted: string;
  /** Null when the token never expires. */
  tokenExpiresAt: Date | null;
  connectedAt: Date;
  /** The Facebook Page linked to the Instagram account: Instagram DMs are sent and received through it. */
  messagingPageId?: string | null;
  /** That Page's access token (encrypted), for the inbox's replies. */
  messagingTokenEncrypted?: string | null;
}
