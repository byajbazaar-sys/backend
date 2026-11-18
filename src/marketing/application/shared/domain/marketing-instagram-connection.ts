export interface MarketingInstagramConnection {
  userId: string;
  instagramUserId: string;
  username: string;
  accessTokenEncrypted: string;
  /** Null when the token never expires. */
  tokenExpiresAt: Date | null;
  connectedAt: Date;
}
