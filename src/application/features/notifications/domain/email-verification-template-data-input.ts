import { Type } from 'class-transformer';

export class EmailVerificationTemplateDataInput {
  userName?: string;
  verificationUrl?: string;
  appName?: string;

  @Type(() => Number)
  year?: number;
}
