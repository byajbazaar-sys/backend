import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

import { ETransactionPaidIn } from '../../transactions/enums/e-transaction-paid-in';

export class AddOrderAdvanceRequestModel {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsNotEmpty()
  amount: number;

  @ApiPropertyOptional({ enum: ETransactionPaidIn, default: ETransactionPaidIn.CASH })
  @IsOptional()
  @IsEnum(ETransactionPaidIn)
  paymentMode?: ETransactionPaidIn;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transactionReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
