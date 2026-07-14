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
  subscriptionId?: string | null;

  @Expose()
  @ApiProperty()
  providerPaymentId: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  providerOrderId?: string | null;

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
  method?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  bank?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  wallet?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  upi?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  fee?: number | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  tax?: number | null;

  @Expose()
  @ApiPropertyOptional({ type: Date, nullable: true })
  @Type(() => Date)
  capturedAt?: Date | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  invoiceId?: string | null;

  @Expose()
  @ApiPropertyOptional({ type: Date })
  @Type(() => Date)
  createdAt?: Date;
}
