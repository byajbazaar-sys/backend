export const WEBHOOK_SERVICE = 'WEBHOOK_SERVICE';

export interface IWebhookService {
  handleWebhook(rawBody: string, signature: string): Promise<{ received: boolean; duplicate?: boolean }>;
}
