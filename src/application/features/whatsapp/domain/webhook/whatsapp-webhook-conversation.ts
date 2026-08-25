import { Expose, Type } from 'class-transformer';

import { WhatsAppWebhookConversationOrigin } from './whatsapp-webhook-conversation-origin';

export class WhatsAppWebhookConversation {
  @Expose()
  id: string;

  @Expose()
  @Type(() => WhatsAppWebhookConversationOrigin)
  origin: WhatsAppWebhookConversationOrigin;
}
