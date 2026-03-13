export class GoogleOAuthOptions {
  public readonly clientId: string;
  public readonly clientSecret: string;
  public readonly redirectUri?: string;

  constructor(clientId: string, clientSecret: string, redirectUri?: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
  }
}
