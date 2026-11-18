import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class WhatsAppMessageDeliveryStatusResponseModel {
  @ApiProperty({ example: 'wamid.HBgM...' })
  @Expose()
  messageId: string;

  @ApiProperty({ enum: ['sent', 'delivered', 'read', 'failed'], example: 'delivered' })
  @Expose()
  deliveryStatus: string;

  @ApiProperty({ example: '919827258776' })
  @Expose()
  recipient: string;

  @ApiPropertyOptional({ example: '1786968273' })
  @Expose()
  statusTimestamp?: string;

  @ApiPropertyOptional({ example: 131026 })
  @Expose()
  errorCode?: number;

  @ApiPropertyOptional({ example: 'Message undeliverable' })
  @Expose()
  errorTitle?: string;

  @ApiPropertyOptional({ example: 'Recipient phone number is not a WhatsApp user' })
  @Expose()
  errorMessage?: string;
}
