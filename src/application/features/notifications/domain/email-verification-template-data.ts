import { Type } from 'class-transformer';

import { EmailVerificationTemplateDataInput } from './email-verification-template-data-input';

export class EmailVerificationTemplateData {
  userName: string;
  verificationUrl: string;
  appName?: string;

  @Type(() => Number)
  year?: number;

  constructor(data: EmailVerificationTemplateDataInput = {}) {
    Object.assign(this, data);
  }
}
