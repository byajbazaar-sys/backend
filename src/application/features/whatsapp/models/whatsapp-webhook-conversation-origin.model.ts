import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class WhatsAppWebhookConversationOriginModel {
  @ApiProperty({ example: 'utility' })
  @Expose()
  type: string;
}
