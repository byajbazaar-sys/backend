import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ETransactionType, ETransactionPaidIn } from '../enums';
import { CustomerResponseModel } from '../../customers';
import { DueResponseModel } from './dues-response.model';

export class TransactionResponseModel {
  @Expose()
  @ApiProperty({ description: 'Unique identifier of the transaction', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Loan ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  loanId: string;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Transaction amount', example: 5000 })
  amount: number;

  @Expose()
  @ApiProperty({ enum: ETransactionType, example: ETransactionType.INTEREST, description: 'Transaction type' })
  transactionType: ETransactionType;

  @Expose()
  @ApiProperty({ enum: ETransactionPaidIn, example: ETransactionPaidIn.CASH, description: 'Payment method' })
  paidIn: ETransactionPaidIn;

  @Expose()
  @ApiProperty({ description: 'User ID of the creator of this record', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
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

  @Expose()
  @ApiPropertyOptional({ description: 'Due ID when transaction type is due payment' })
  dueId?: string;

  @Expose()
  @ApiPropertyOptional({
    type: () => DueResponseModel,
    description: 'Due payment details when transaction type is DuePayment',
  })
  @Type(() => DueResponseModel)
  due?: DueResponseModel;

  @Expose()
  @ApiPropertyOptional({
    description: 'Whether this transaction is the most recent one on its loan',
    example: true,
  })
  isLatest?: boolean;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Whether the client may delete this transaction (loan is open; includes DuePayment and older rows)',
    example: true,
  })
  canDelete?: boolean;
}
