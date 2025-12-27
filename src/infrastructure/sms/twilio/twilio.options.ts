export class TwilioOptions {
  public accountSid: string;
  public authToken: string;
  public phoneNumber: string;
  constructor(accountSid: string, authToken: string, phoneNumber: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.phoneNumber = phoneNumber;
  }
}
