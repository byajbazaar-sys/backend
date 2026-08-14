import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { EDepositStatus } from '../enums';
import { DepositTransactionResponseModel } from './deposit-transaction-response.model';

export class DepositResponseModel {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  depositNumber: string;

  @Expose()
  @ApiProperty()
  customerId: string;

  @Expose()
  @ApiPropertyOptional()
  customerFirstName?: string;

  @Expose()
  @ApiPropertyOptional()
  customerLastName?: string;

  @Expose()
  @ApiPropertyOptional()
  customerPhone?: string;

  @Expose()
  @ApiPropertyOptional()
  name?: string;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  currentBalance: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  totalDeposited: number;

  @Expose()
  @ApiProperty({ enum: EDepositStatus })
  status: EDepositStatus;

  @Expose()
  @ApiPropertyOptional()
  notes?: string;

  @Expose()
  @Type(() => Date)
  @ApiProperty()
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  @ApiProperty()
  updatedAt: Date;

  @Expose()
  @Type(() => DepositTransactionResponseModel)
  @ApiPropertyOptional({ type: [DepositTransactionResponseModel] })
  transactions?: DepositTransactionResponseModel[];
}
