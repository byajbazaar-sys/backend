import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { WhatsAppWebhookEntryModel } from './whatsapp-webhook-entry.model';

export class WhatsAppWebhookPayloadModel {
  @ApiProperty({ example: 'whatsapp_business_account' })
  @Expose()
  object: string;

  @ApiProperty({ type: [WhatsAppWebhookEntryModel] })
  @Expose()
  @Type(() => WhatsAppWebhookEntryModel)
  entry: WhatsAppWebhookEntryModel[];
}
