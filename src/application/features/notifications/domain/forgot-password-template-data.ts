export class ForgotPasswordTemplateData {
  userName: string;
  resetUrl: string;
  appName?: string;
  year?: number;

  constructor(data: Partial<ForgotPasswordTemplateData> = {}) {
    Object.assign(this, data);
  }
}
