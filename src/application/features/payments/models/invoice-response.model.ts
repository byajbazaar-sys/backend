import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class InvoiceResponseModel {
  @Expose()
  @ApiProperty()
  id: string;

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
  providerOrderId?: string;

  @Expose()
  @ApiProperty({ type: Date })
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  subscriptionId?: string;
}
