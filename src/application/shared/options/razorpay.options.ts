export class RazorpayOptions {
  constructor(
    public readonly keyId: string,
    public readonly keySecret: string,
    public readonly webhookSecret: string,
    public readonly planCurrency: string = 'INR',
    public readonly defaultTrialDays: number = 7,
  ) {}
}
