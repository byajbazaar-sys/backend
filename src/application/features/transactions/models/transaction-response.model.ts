import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ETransactionType, ETransactionPaidIn } from '../enums';
import { CustomerResponseModel } from '../../customers';

export class TransactionResponseModel {
  @Expose()
  @ApiProperty({ description: 'Unique identifier of the transaction', example: '507f1f77bcf86cd799439011' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Loan ID', example: '507f1f77bcf86cd799439011' })
  loanId: string;

  @Expose()
  @ApiProperty({ description: 'Transaction amount', example: 5000 })
  amount: number;

  @Expose()
  @ApiProperty({ enum: ETransactionType, example: ETransactionType.INTEREST, description: 'Transaction type' })
  transactionType: ETransactionType;

  @Expose()
  @ApiProperty({ enum: ETransactionPaidIn, example: ETransactionPaidIn.CASH, description: 'Payment method' })
  paidIn: ETransactionPaidIn;

  @Expose()
  @ApiProperty({ description: 'Payment date in milliseconds', example: 1715040000 })
  @Type(() => Date)
  paidAt: Date;

  @Expose()
  @ApiProperty({ description: 'User ID of the creator of this record', example: '507f1f77bcf86cd799439011' })
  createdBy: string;

  @Expose()
  @ApiProperty({ description: 'Date when the transaction was created', type: Date })
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Date when the transaction was last updated', type: Date })
  @Type(() => Date)
  updatedAt: Date;

  @Expose()
  @Type(() => CustomerResponseModel)
  customer: CustomerResponseModel;
}
