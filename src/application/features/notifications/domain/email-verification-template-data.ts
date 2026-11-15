import { Type } from 'class-transformer';

import { EmailVerificationTemplateDataInput } from './email-verification-template-data-input';

export class EmailVerificationTemplateData {
  userName: string;
  /** 6-digit one-time code. */
  code: string;
  expiresMinutes?: number;
  appName?: string;

  @Type(() => Number)
  year?: number;

  constructor(data: EmailVerificationTemplateDataInput = {}) {
    Object.assign(this, data);
  }
}
