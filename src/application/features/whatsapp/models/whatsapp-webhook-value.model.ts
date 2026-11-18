import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { WhatsAppWebhookContactModel } from './whatsapp-webhook-contact.model';
import { WhatsAppWebhookInboundMessageModel } from './whatsapp-webhook-inbound-message.model';
import { WhatsAppWebhookMessageStatusModel } from './whatsapp-webhook-message-status.model';
import { WhatsAppWebhookMetadataModel } from './whatsapp-webhook-metadata.model';

export class WhatsAppWebhookValueModel {
  @ApiProperty({ example: 'whatsapp' })
  @Expose()
  messagingProduct: string;

  @ApiProperty({ type: WhatsAppWebhookMetadataModel })
  @Expose()
  @Type(() => WhatsAppWebhookMetadataModel)
  metadata: WhatsAppWebhookMetadataModel;

  @ApiPropertyOptional({ type: [WhatsAppWebhookContactModel] })
  @Expose()
  @Type(() => WhatsAppWebhookContactModel)
  contacts?: WhatsAppWebhookContactModel[];

  @ApiPropertyOptional({ type: [WhatsAppWebhookInboundMessageModel] })
  @Expose()
  @Type(() => WhatsAppWebhookInboundMessageModel)
  messages?: WhatsAppWebhookInboundMessageModel[];

  @ApiPropertyOptional({ type: [WhatsAppWebhookMessageStatusModel] })
  @Expose()
  @Type(() => WhatsAppWebhookMessageStatusModel)
  statuses?: WhatsAppWebhookMessageStatusModel[];
}
