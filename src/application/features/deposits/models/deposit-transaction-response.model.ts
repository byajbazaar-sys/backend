import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { EDepositTransactionType } from '../enums';

export class DepositTransactionResponseModel {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  depositAccountId: string;

  @Expose()
  @ApiProperty({ enum: EDepositTransactionType })
  type: EDepositTransactionType;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  amount: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  balanceAfter: number;

  @Expose()
  @ApiPropertyOptional()
  paymentMode?: string;

  @Expose()
  @ApiPropertyOptional()
  transactionReference?: string;

  @Expose()
  @ApiPropertyOptional()
  salesBillId?: string;

  @Expose()
  @Type(() => Date)
  @ApiProperty()
  transactionDate: Date;

  @Expose()
  @ApiPropertyOptional()
  notes?: string;

  @Expose()
  @ApiPropertyOptional()
  receiptNumber?: string;

  @Expose()
  @ApiPropertyOptional()
  staffName?: string;

  @Expose()
  @Type(() => Date)
  @ApiProperty()
  createdAt: Date;
}
