import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { ETransactionPaidIn } from '../../transactions/enums/e-transaction-paid-in';

export class AddDepositAmountRequestModel {
  @ApiProperty({ example: 5000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ enum: ETransactionPaidIn })
  @IsEnum(ETransactionPaidIn)
  paymentMode: ETransactionPaidIn;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  transactionReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  depositDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}
