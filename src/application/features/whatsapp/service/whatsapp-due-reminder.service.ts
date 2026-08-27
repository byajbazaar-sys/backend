import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { DUES_REPOSITORY, IDuesRepository } from '../../../shared/repository/i-due.repository';

import { WHATSAPP_DEFAULT_TEMPLATES } from '../constants/whatsapp-default-template.constants';
import { IWhatsAppDueReminderService, WhatsAppDueReminderRunResult } from './i-whatsapp-due-reminder.service';
import { IWhatsAppService, WHATSAPP_SERVICE } from './i-whatsapp.service';

const DUE_REMINDER_TEMPLATE =
  WHATSAPP_DEFAULT_TEMPLATES.find((template) => template.name === 'byajbazaar_due_reminder') ??
  WHATSAPP_DEFAULT_TEMPLATES[1];

@Injectable()
export class WhatsAppDueReminderService implements IWhatsAppDueReminderService {
  constructor(
    @Inject(DUES_REPOSITORY) private readonly duesRepo: IDuesRepository,
    @Inject(WHATSAPP_SERVICE) private readonly whatsappService: IWhatsAppService,
    @InjectPinoLogger(WhatsAppDueReminderService.name) private readonly logger: PinoLogger,
  ) {}

  async sendPendingDueReminders(): Promise<WhatsAppDueReminderRunResult> {
    const candidates = await this.duesRepo.findPendingWhatsAppDueReminders();
    const result: WhatsAppDueReminderRunResult = { sent: 0, skipped: 0, failed: 0 };

    for (const candidate of candidates) {
      const recipient = this.normalizeRecipientPhone(candidate.customerPhone);
      if (!recipient) {
        result.skipped += 1;
        this.logger.warn(
          {
            operation: 'sendPendingDueReminders',
            dueId: candidate.dueId,
            userId: candidate.userId,
          },
          'Skipping WhatsApp due reminder — customer phone is missing or invalid',
        );
        continue;
      }

      const businessName = candidate.businessName?.trim() || 'Your business';
      const dueDescription = `${candidate.customerFirstName?.trim() || 'Customer'} loan due`;
      const formattedAmount = this.formatInrAmount(candidate.dueAmount);

      try {
        await this.whatsappService.sendTemplateMessage(
          candidate.userId,
          candidate.userId,
          recipient,
          DUE_REMINDER_TEMPLATE.name,
          DUE_REMINDER_TEMPLATE.language,
          [businessName, dueDescription, formattedAmount],
        );
        await this.duesRepo.markWhatsAppReminderSent(candidate.dueId);
        result.sent += 1;
        this.logger.info(
          {
            operation: 'sendPendingDueReminders',
            dueId: candidate.dueId,
            userId: candidate.userId,
            recipient,
          },
          'WhatsApp due reminder sent',
        );
      } catch (err) {
        result.failed += 1;
        this.logger.warn(
          { err, operation: 'sendPendingDueReminders', dueId: candidate.dueId, userId: candidate.userId },
          'Failed to send WhatsApp due reminder',
        );
      }
    }

    if (result.sent || result.failed || result.skipped) {
      this.logger.info({ operation: 'sendPendingDueReminders', ...result }, 'WhatsApp due reminder run finished');
    }

    return result;
  }

  private normalizeRecipientPhone(phone: string | undefined): string | null {
    const digits = phone?.replace(/\D/g, '') ?? '';
    if (digits.length === 10) {
      return `91${digits}`;
    }
    if (digits.length >= 11 && digits.length <= 15) {
      return digits;
    }
    return null;
  }

  private formatInrAmount(amount: number): string {
    const value = Number(amount);
    if (!Number.isFinite(value)) {
      return '₹0';
    }
    return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
}
