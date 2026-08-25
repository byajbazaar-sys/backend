import { WhatsAppWebhookAckResult } from '../domain';

export const WHATSAPP_WEBHOOK_SERVICE = 'WHATSAPP_WEBHOOK_SERVICE';

export interface IWhatsAppWebhookService {
  verifySubscription(mode: string | undefined, verifyToken: string | undefined, challenge: string | undefined): string;
  handleWebhook(rawBody: string, signature: string | undefined): Promise<WhatsAppWebhookAckResult>;
}
