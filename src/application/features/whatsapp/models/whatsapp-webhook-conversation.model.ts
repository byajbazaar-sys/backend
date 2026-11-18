import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { WhatsAppWebhookConversationOriginModel } from './whatsapp-webhook-conversation-origin.model';

export class WhatsAppWebhookConversationModel {
  @ApiProperty({ example: 'd552e6f3a0e9cc0b3d0bb6b3df01e250' })
  @Expose()
  id: string;

  @ApiProperty({ type: WhatsAppWebhookConversationOriginModel })
  @Expose()
  @Type(() => WhatsAppWebhookConversationOriginModel)
  origin: WhatsAppWebhookConversationOriginModel;
}
