import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { WhatsAppWebhookChangeModel } from './whatsapp-webhook-change.model';

export class WhatsAppWebhookEntryModel {
  @ApiProperty({ example: '1837718593882679' })
  @Expose()
  id: string;

  @ApiProperty({ type: [WhatsAppWebhookChangeModel] })
  @Expose()
  @Type(() => WhatsAppWebhookChangeModel)
  changes: WhatsAppWebhookChangeModel[];
}
