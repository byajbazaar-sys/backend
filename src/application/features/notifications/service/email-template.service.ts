import { Injectable } from '@nestjs/common';
import mjml2html from 'mjml';

import { EmailVerificationTemplateData, ForgotPasswordTemplateData, ShopInviteTemplateData } from '../domain';
import { IEmailTemplateService } from './i-email-template.service';
import { EMAIL_VERIFICATION_TEMPLATE, FORGOT_PASSWORD_TEMPLATE, SHOP_INVITE_TEMPLATE } from '../utils';

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class EmailTemplateService implements IEmailTemplateService {
  renderEmailVerification(data: EmailVerificationTemplateData): string {
    const html = this.compileTemplate(EMAIL_VERIFICATION_TEMPLATE, {
      userName: escapeHtml(data.userName),
      code: data.code,
      expiresMinutes: data.expiresMinutes ?? 10,
      appName: data.appName ?? 'ByajBazaar',
      year: data.year ?? new Date().getFullYear(),
    });
    return html;
  }

  renderForgotPassword(data: ForgotPasswordTemplateData): string {
    const html = this.compileTemplate(FORGOT_PASSWORD_TEMPLATE, {
      userName: escapeHtml(data.userName),
      resetUrl: data.resetUrl,
      appName: data.appName ?? 'ByajBazaar',
      year: data.year ?? new Date().getFullYear(),
    });
    return html;
  }

  renderShopInvite(data: ShopInviteTemplateData): string {
    return this.compileTemplate(SHOP_INVITE_TEMPLATE, {
      shopName: escapeHtml(data.shopName),
      inviterName: escapeHtml(data.inviterName),
      roleLabel: escapeHtml(data.roleLabel),
      email: escapeHtml(data.email),
      inviteUrl: data.inviteUrl,
      expiresDays: data.expiresDays,
      appName: data.appName ?? 'ByajBazaar',
      year: data.year ?? new Date().getFullYear(),
    });
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
