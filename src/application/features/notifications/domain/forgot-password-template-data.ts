import { Type } from 'class-transformer';

import { ForgotPasswordTemplateDataInput } from './forgot-password-template-data-input';

export class ForgotPasswordTemplateData {
  userName: string;
  resetUrl: string;
  appName?: string;

  @Type(() => Number)
  year?: number;

  constructor(data: ForgotPasswordTemplateDataInput = {}) {
    Object.assign(this, data);
  }
}
