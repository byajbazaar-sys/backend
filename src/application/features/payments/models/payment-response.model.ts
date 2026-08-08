import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class PaymentResponseModel {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  userId: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  subscriptionId?: string;

  @Expose()
  @ApiProperty()
  providerPaymentId: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  providerOrderId?: string;

  @Expose()
  @ApiProperty()
  amount: number;

  @Expose()
  @ApiProperty({ example: 'INR' })
  currency: string;

  @Expose()
  @ApiProperty()
  status: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  method?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  bank?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  wallet?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  upi?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  fee?: number;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  tax?: number;

  @Expose()
  @ApiPropertyOptional({ type: Date, nullable: true })
  @Type(() => Date)
  capturedAt?: Date;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  invoiceId?: string;

  @Expose()
  @ApiPropertyOptional({ type: Date })
  @Type(() => Date)
  createdAt?: Date;
}
