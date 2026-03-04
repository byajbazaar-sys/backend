export class SendGridOptions {
  public apiKey: string;
  public sender?: string;
  public senderName?: string;

  constructor(
    apiKey: string,
    sender?: string,
    senderName?: string,
  ) {
    this.apiKey = apiKey;
    this.sender = sender;
    this.senderName = senderName;
  }
}
