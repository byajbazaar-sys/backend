export class MetaWhatsAppOptions {
  constructor(
    public readonly graphApiVersion: string,
    public readonly appId: string,
    public readonly appSecret: string,
    public readonly webhookVerifyToken: string,
  ) {}

  get graphApiBaseUrl(): string {
    return `https://graph.facebook.com/${this.graphApiVersion}`;
  }

  get isWebhookVerifyConfigured(): boolean {
    return Boolean(this.webhookVerifyToken);
  }

  get isWebhookSignatureConfigured(): boolean {
    return Boolean(this.appSecret);
  }
}
