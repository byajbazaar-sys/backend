import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsEnum, IsMongoId, IsDateString, Min, IsOptional, IsUUID } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { ETransactionType, ETransactionPaidIn } from '../enums';

export class CreateTransactionRequestModel {
  @Expose()
  @ApiPropertyOptional({ description: 'Loan ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327', required: false })
  @IsString()
  @IsOptional()
  @IsUUID()
  loanId?: string;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Transaction amount', example: 5000 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.001)
  amount: number;

  @Expose()
  @ApiProperty({ enum: ETransactionType, example: ETransactionType.INTEREST, description: 'Transaction type' })
  @IsEnum(ETransactionType)
  @IsNotEmpty()
  transactionType: ETransactionType;

  @Expose()
  @ApiProperty({ enum: ETransactionPaidIn, example: ETransactionPaidIn.CASH, description: 'Payment method' })
  @IsEnum(ETransactionPaidIn)
  @IsNotEmpty()
  paidIn: ETransactionPaidIn;

  @Expose()
  @ApiProperty({ description: 'Payment date', example: new Date() })
  @IsNotEmpty()
  @Type(() => Date)
  paidAt: Date;

  @Expose()
  @ApiProperty({ description: 'Due ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327', required: false })
  @IsString()
  @IsOptional()
  @IsUUID()
  dueId?: string;
}
