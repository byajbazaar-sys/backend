export class LambdaOptions {
  public region: string;
  public accessKeyId: string;
  public secretAccessKey: string;
  constructor(region: string, accessKeyId: string, secretAccessKey: string) {
    this.region = region;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
  }
}
