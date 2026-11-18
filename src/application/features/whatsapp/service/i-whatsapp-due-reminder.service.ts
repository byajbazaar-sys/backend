import { WhatsAppDueReminderRunResult } from './whatsapp-due-reminder-run-result';

export const WHATSAPP_DUE_REMINDER_SERVICE = 'WHATSAPP_DUE_REMINDER_SERVICE';

export interface IWhatsAppDueReminderService {
  sendPendingDueReminders(): Promise<WhatsAppDueReminderRunResult>;
}
