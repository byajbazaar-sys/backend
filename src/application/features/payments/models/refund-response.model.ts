import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class RefundResponseModel {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  paymentId!: string;

  @Expose()
  @ApiProperty()
  providerRefundId!: string;

  @Expose()
  @ApiProperty()
  amount!: number;

  @Expose()
  @ApiProperty()
  status!: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  reason?: string;

  @Expose()
  @ApiPropertyOptional({ type: Date })
  @Type(() => Date)
  createdAt?: Date;
}
