import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class WebhookEventSummaryModel {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  eventName!: string;

  @Expose()
  @ApiProperty()
  processed!: boolean;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  userId?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  paymentId?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  paymentOrderId?: string;
}
