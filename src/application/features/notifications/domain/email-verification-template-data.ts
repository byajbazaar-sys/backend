export class EmailVerificationTemplateData {
  userName: string;
  verificationUrl: string;
  appName?: string;
  year?: number;

  constructor(data: Partial<EmailVerificationTemplateData> = {}) {
    Object.assign(this, data);
  }
}
