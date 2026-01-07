import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsEnum, IsMongoId, IsDateString, Min } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { ETransactionType, ETransactionPaidIn } from '../enums';

export class CreateTransactionRequestModel {
  @Expose()
  @ApiProperty({ description: 'Loan ID', example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  @IsMongoId()
  loanId: string;

  @Expose()
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
  @ApiProperty({ description: 'Payment date', example: new Date().toISOString() })
  @IsDateString()
  @IsNotEmpty()
  @Type(() => Date)
  paidAt: Date;
}
