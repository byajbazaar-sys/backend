import { Injectable } from '@nestjs/common';
import mjml2html from 'mjml';

import { EmailVerificationTemplateData, ForgotPasswordTemplateData } from '../domain';
import { IEmailTemplateService } from '../interfaces';
import { EMAIL_VERIFICATION_TEMPLATE, FORGOT_PASSWORD_TEMPLATE } from '../templates';

@Injectable()
export class EmailTemplateService implements IEmailTemplateService {
  renderEmailVerification(data: EmailVerificationTemplateData): string {
    const html = this.compileTemplate(EMAIL_VERIFICATION_TEMPLATE, {
      userName: data.userName,
      verificationUrl: data.verificationUrl,
      appName: data.appName ?? 'CrowdSay',
      year: data.year ?? new Date().getFullYear(),
    });
    return html;
  }

  renderForgotPassword(data: ForgotPasswordTemplateData): string {
    const html = this.compileTemplate(FORGOT_PASSWORD_TEMPLATE, {
      userName: data.userName,
      resetUrl: data.resetUrl,
      appName: data.appName ?? 'CrowdSay',
      year: data.year ?? new Date().getFullYear(),
    });
    return html;
  }

  private compileTemplate(mjmlContent: string, variables: Record<string, string | number>): string {
    let content = mjmlContent;
    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    const { html } = mjml2html(content);
    return html;
  }
}
