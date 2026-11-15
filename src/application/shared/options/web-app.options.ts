export class WebAppOptions {
  public domain: string;

  constructor(domain?: string) {
    this.domain = domain?.trim()?.replace(/\/$/, '') ?? 'http://localhost:3000';
  }

  getBaseUrl(): string {
    return this.domain;
  }


  buildResetPasswordUrl(token: string): string {
    return `${this.domain}/reset-password?token=${token}`;
  }
}
