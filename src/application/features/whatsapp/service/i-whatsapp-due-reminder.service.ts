export const WHATSAPP_DUE_REMINDER_SERVICE = 'WHATSAPP_DUE_REMINDER_SERVICE';

export interface WhatsAppDueReminderRunResult {
  sent: number;
  skipped: number;
  failed: number;
}

export interface IWhatsAppDueReminderService {
  sendPendingDueReminders(): Promise<WhatsAppDueReminderRunResult>;
}
