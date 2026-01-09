import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { CustomerResponseModel } from '../../customers';
import { EDueType } from '../../../shared';
import { TransactionResponseModel } from './transaction-response.model';
export class DueResponseModel {
  @Expose()
  @ApiProperty({ example: '2024-01-15T00:00:00.000Z' })
  @Type(() => Date)
  dueDate: Date;

  @Expose()
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'Loan ID' })
  loanId: string;

  @Expose()
  @ApiProperty({ example: 1250.5, description: 'Due amount' })
  dueAmount: number;

  @Expose()
  @ApiProperty({ type: CustomerResponseModel, description: 'Customer' })
  @Type(() => CustomerResponseModel)
  customer: CustomerResponseModel;

  @Expose()
  @ApiProperty({ enum: EDueType, example: EDueType.PAST_DUE })
  @Type(() => String)
  type: EDueType;

  @Expose()
  @ApiProperty({ type: TransactionResponseModel, description: 'Transaction' })
  @Type(() => TransactionResponseModel)
  transaction?: TransactionResponseModel;
}
