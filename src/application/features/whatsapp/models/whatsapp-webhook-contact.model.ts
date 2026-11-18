import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class WhatsAppWebhookContactModel {
  @ApiProperty({ example: '919827258776' })
  @Expose()
  waId: string;

  @ApiPropertyOptional({ example: 'IN.2321023728634926' })
  @Expose()
  userId?: string;
}
