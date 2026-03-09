import { Type } from 'class-transformer';

export class EmailVerificationTemplateData {
  userName: string;
  verificationUrl: string;
  appName?: string;
  @Type(() => Number)
  year?: number;

  constructor(data: Partial<EmailVerificationTemplateData> = {}) {
    Object.assign(this, data);
  }
}
