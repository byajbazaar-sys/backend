import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEnum, IsMongoId, IsDateString, Min, IsUUID } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { ETransactionType, ETransactionPaidIn } from '../enums';

export class UpdateTransactionRequestModel {
  @Expose()
  @ApiPropertyOptional({ description: 'Loan ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  @IsString()
  @IsOptional()
  @IsUUID()
  loanId?: string;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Transaction amount', example: 5000 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  amount?: number;

  @Expose()
  @ApiPropertyOptional({ enum: ETransactionType, example: ETransactionType.INTEREST, description: 'Transaction type' })
  @IsEnum(ETransactionType)
  @IsOptional()
  transactionType?: ETransactionType;

  @Expose()
  @ApiPropertyOptional({ enum: ETransactionPaidIn, example: ETransactionPaidIn.CASH, description: 'Payment method' })
  @IsEnum(ETransactionPaidIn)
  @IsOptional()
  paidIn?: ETransactionPaidIn;

  @Expose()
  @ApiPropertyOptional({ description: 'Payment date', example: '2024-01-15T10:30:00Z' })
  @IsDateString()
  @IsOptional()
  paidAt?: string;
}
