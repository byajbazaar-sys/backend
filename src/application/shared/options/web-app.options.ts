export class WebAppOptions {
  public domain: string;

  constructor(domain?: string) {
    this.domain = domain?.trim()?.replace(/\/$/, '') ?? 'http://localhost:3000';
  }

  getBaseUrl(): string {
    return this.domain;
  }

  buildVerifyEmailUrl(token: string): string {
    return `${this.domain}/verify-email?token=${token}`;
  }

  buildResetPasswordUrl(token: string): string {
    return `${this.domain}/reset-password?token=${token}`;
  }
}
