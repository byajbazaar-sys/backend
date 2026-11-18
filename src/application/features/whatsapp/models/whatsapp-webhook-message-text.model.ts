import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class WhatsAppWebhookMessageTextModel {
  @ApiProperty({ example: 'Hello from ByajBazaar' })
  @Expose()
  body: string;
}
