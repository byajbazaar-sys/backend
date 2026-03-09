import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { CustomerResponseModel } from '../../customers';
import { EDueType } from '../../../shared';
import { TransactionResponseModel } from './transaction-response.model';
export class DueResponseModel {
  @Expose()
  @ApiProperty({ example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327', description: 'Due ID' })
  id: string;

  @Expose()
  @ApiProperty({ example: '2024-01-15T00:00:00.000Z' })
  @Type(() => Date)
  dueDate: Date;

  @Expose()
  @ApiProperty({ example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327', description: 'Loan ID' })
  loanId: string;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ example: 1250.5, description: 'Due amount' })
  dueAmount: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ example: 1000, description: 'Principal amount for this due' })
  principalAmount: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ example: 250.5, description: 'Interest amount for this due' })
  interestAmount: number;

  @Expose()
  @ApiProperty({ example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327', description: 'Customer ID' })
  customerId?: string;

  @Expose()
  @ApiProperty({ type: CustomerResponseModel, description: 'Customer', required: false })
  @Type(() => CustomerResponseModel)
  customer?: CustomerResponseModel;

  @Expose()
  @ApiProperty({ enum: EDueType, example: EDueType.PAST_DUE })
  @Type(() => String)
  type: EDueType;

  @Expose()
  @ApiProperty({ type: TransactionResponseModel, description: 'Transaction' })
  @Type(() => TransactionResponseModel)
  latestTransaction?: TransactionResponseModel;
}
