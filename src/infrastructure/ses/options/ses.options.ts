export class SesOptions {
  public region: string;
  public accessKeyId: string;
  public secretAccessKey: string;
  public sender: string;
  public senderName?: string;

  constructor(region: string, accessKeyId: string, secretAccessKey: string, sender: string, senderName?: string) {
    this.region = region;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.sender = sender;
    this.senderName = senderName;
  }
}
