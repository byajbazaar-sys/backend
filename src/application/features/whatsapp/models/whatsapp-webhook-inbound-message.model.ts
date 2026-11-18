import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { WhatsAppWebhookMessageTextModel } from './whatsapp-webhook-message-text.model';

export class WhatsAppWebhookInboundMessageModel {
  @ApiProperty({ example: '919827258776' })
  @Expose()
  from: string;

  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  timestamp: string;

  @ApiProperty({ example: 'text' })
  @Expose()
  type: string;

  @ApiPropertyOptional({ type: WhatsAppWebhookMessageTextModel })
  @Expose()
  @Type(() => WhatsAppWebhookMessageTextModel)
  text?: WhatsAppWebhookMessageTextModel;
}
