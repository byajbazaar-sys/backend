import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { WhatsAppWebhookValueModel } from './whatsapp-webhook-value.model';

export class WhatsAppWebhookChangeModel {
  @ApiProperty({ type: WhatsAppWebhookValueModel })
  @Expose()
  @Type(() => WhatsAppWebhookValueModel)
  value: WhatsAppWebhookValueModel;

  @ApiProperty({ example: 'messages' })
  @Expose()
  field: string;
}
