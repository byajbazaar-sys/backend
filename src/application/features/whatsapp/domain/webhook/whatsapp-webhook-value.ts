import { Expose, Type } from 'class-transformer';

import { WhatsAppWebhookContact } from './whatsapp-webhook-contact';
import { WhatsAppWebhookInboundMessage } from './whatsapp-webhook-inbound-message';
import { WhatsAppWebhookMessageStatus } from './whatsapp-webhook-message-status';
import { WhatsAppWebhookMetadata } from './whatsapp-webhook-metadata';

export class WhatsAppWebhookValue {
  @Expose({ name: 'messaging_product' })
  messagingProduct: string;

  @Expose()
  @Type(() => WhatsAppWebhookMetadata)
  metadata: WhatsAppWebhookMetadata;

  @Expose()
  @Type(() => WhatsAppWebhookContact)
  contacts?: WhatsAppWebhookContact[];

  @Expose()
  @Type(() => WhatsAppWebhookInboundMessage)
  messages?: WhatsAppWebhookInboundMessage[];

  @Expose()
  @Type(() => WhatsAppWebhookMessageStatus)
  statuses?: WhatsAppWebhookMessageStatus[];
}
