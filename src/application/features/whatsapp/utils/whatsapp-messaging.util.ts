import { WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS } from '../constants/whatsapp-messaging.constants';

export function normalizeWhatsAppRecipient(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

export function isWithinCustomerServiceWindow(lastInboundAt: Date | null | undefined, now = new Date()): boolean {
  if (!lastInboundAt) {
    return false;
  }
  return now.getTime() - lastInboundAt.getTime() < WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS;
}

export function parseWhatsAppWebhookUnixTimestamp(timestamp: string | undefined): Date {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return new Date();
  }
  return new Date(seconds * 1000);
}
