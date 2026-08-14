import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { ETransactionLogAction, ETransactionPaidIn, ETransactionType } from '../enums';

export class TransactionLogResponseModel {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiPropertyOptional()
  transactionId?: string;

  @Expose()
  @ApiProperty()
  loanId: string;

  @Expose()
  @ApiProperty({ enum: ETransactionLogAction })
  action: ETransactionLogAction;

  @Expose()
  @ApiPropertyOptional({ enum: ETransactionType })
  transactionType?: ETransactionType;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional()
  previousAmount?: number;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional()
  newAmount?: number;

  @Expose()
  @ApiPropertyOptional({ enum: ETransactionPaidIn })
  previousPaidIn?: ETransactionPaidIn;

  @Expose()
  @ApiPropertyOptional({ enum: ETransactionPaidIn })
  newPaidIn?: ETransactionPaidIn;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional()
  loanVersion?: number;

  @Expose()
  @ApiProperty()
  performedBy: string;

  @Expose()
  @Type(() => Date)
  @ApiProperty()
  createdAt: Date;
}
