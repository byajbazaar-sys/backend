import { Type } from 'class-transformer';

export class EmailVerificationTemplateDataInput {
  userName?: string;
  /** 6-digit one-time code. */
  code?: string;
  expiresMinutes?: number;
  appName?: string;

  @Type(() => Number)
  year?: number;
}
