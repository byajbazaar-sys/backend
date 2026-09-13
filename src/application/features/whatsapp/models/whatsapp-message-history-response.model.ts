import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class WhatsAppMessageHistoryResponseModel {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ example: '919827258776' })
  @Expose()
  recipient: string;

  @ApiProperty({ description: 'Meta Cloud API message id (wamid)' })
  @Expose()
  metaMessageId: string;

  @ApiPropertyOptional({ enum: ['text', 'template', 'document'] })
  @Expose()
  messageType?: string;

  @ApiPropertyOptional({ example: 'byajbazaar_bill_pdf' })
  @Expose()
  templateName?: string;

  @ApiPropertyOptional({ enum: ['bill', 'due_reminder', 'order', 'manual'] })
  @Expose()
  contextType?: string;

  @ApiPropertyOptional()
  @Expose()
  contextId?: string;

  @ApiPropertyOptional({ example: 'Bill INV-1024 → Rahul Sharma' })
  @Expose()
  contextLabel?: string;

  @ApiProperty({ enum: ['sent', 'delivered', 'read', 'failed'] })
  @Expose()
  deliveryStatus: string;

  @ApiPropertyOptional()
  @Expose()
  statusTimestamp?: string;

  @ApiPropertyOptional()
  @Expose()
  errorCode?: number;

  @ApiPropertyOptional()
  @Expose()
  errorTitle?: string;

  @ApiPropertyOptional()
  @Expose()
  errorMessage?: string;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;
}
