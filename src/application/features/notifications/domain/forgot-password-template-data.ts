import { Type } from 'class-transformer';

export class ForgotPasswordTemplateData {
  userName: string;
  resetUrl: string;
  appName?: string;
  @Type(() => Number)
  year?: number;

  constructor(data: Partial<ForgotPasswordTemplateData> = {}) {
    Object.assign(this, data);
  }
}
