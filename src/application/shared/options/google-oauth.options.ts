export class GoogleOAuthOptions {
  public readonly clientId: string;
  public readonly clientSecret: string;
  public readonly redirectUri?: string;
  public readonly additionalClientIds: string[];

  constructor(clientId: string, clientSecret: string, redirectUri?: string, additionalClientIds: string[] = []) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.additionalClientIds = additionalClientIds;
  }
}
