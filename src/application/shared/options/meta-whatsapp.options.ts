export class MetaWhatsAppOptions {
  constructor(
    public readonly graphApiVersion: string,
    public readonly appId: string,
    public readonly appSecret: string,
    public readonly testWabaId: string,
    public readonly testPhoneNumberId: string,
    public readonly testAccessToken: string,
    public readonly webhookVerifyToken: string,
  ) {}

  get graphApiBaseUrl(): string {
    return `https://graph.facebook.com/${this.graphApiVersion}`;
  }

  get isTestConfigured(): boolean {
    return Boolean(this.testAccessToken && this.testPhoneNumberId && this.testWabaId);
  }

  get isWebhookVerifyConfigured(): boolean {
    return Boolean(this.webhookVerifyToken);
  }

  get isWebhookSignatureConfigured(): boolean {
    return Boolean(this.appSecret);
  }
}
