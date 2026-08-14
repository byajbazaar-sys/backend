import { EmailVerificationTemplateData, ForgotPasswordTemplateData } from '../domain';

export const EMAIL_TEMPLATE_SERVICE = 'IEmailTemplateService';

export interface IEmailTemplateService {
  renderEmailVerification(data: EmailVerificationTemplateData): string;
  renderForgotPassword(data: ForgotPasswordTemplateData): string;
}
