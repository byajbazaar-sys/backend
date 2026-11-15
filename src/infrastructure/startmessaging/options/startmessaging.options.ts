export class StartMessagingOptions {
  constructor(
    public readonly apiKey: string,
    public readonly baseUrl = 'https://api.startmessaging.com',
    /** Optional OTP template id from the StartMessaging dashboard; the default template is used otherwise. */
    public readonly templateId?: string,
    public readonly appName = 'ByajBazaar',
  ) {}
}
