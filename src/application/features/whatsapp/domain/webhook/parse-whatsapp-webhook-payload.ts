import { plainToInstance } from 'class-transformer';

import { WhatsAppWebhookPayload } from './whatsapp-webhook-payload';

export function parseWhatsAppWebhookPayload(raw: unknown): WhatsAppWebhookPayload {
  return plainToInstance(WhatsAppWebhookPayload, raw, {
    excludeExtraneousValues: true,
    enableImplicitConversion: true,
  });
}
