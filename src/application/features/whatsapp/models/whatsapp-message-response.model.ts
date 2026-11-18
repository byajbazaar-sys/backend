import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class WhatsAppMessageResponseModel {
  @ApiProperty({ example: true })
  @Expose()
  success: boolean;

  @ApiProperty({ example: 'wamid.HBgM...' })
  @Expose()
  messageId: string;

  @ApiProperty({ enum: ['sent', 'delivered', 'read', 'failed'], example: 'sent' })
  @Expose()
  deliveryStatus: string;

  @ApiProperty({ enum: ['text', 'template'], example: 'text' })
  @Expose()
  messageType: string;

  @ApiPropertyOptional({ example: 'byajbazaar_hello' })
  @Expose()
  templateName?: string;
}
