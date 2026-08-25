import { Type } from 'class-transformer';

export class ForgotPasswordTemplateDataInput {
  userName?: string;
  resetUrl?: string;
  appName?: string;

  @Type(() => Number)
  year?: number;
}
