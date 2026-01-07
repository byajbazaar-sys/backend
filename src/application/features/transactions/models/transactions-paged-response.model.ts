import { IPageable } from '@shared-libs';
import { Expose, Type } from 'class-transformer';
import { TransactionResponseModel } from './transaction-response.model';
import { ApiProperty } from '@nestjs/swagger';

export class TransactionsPagedResponseModel implements IPageable<TransactionResponseModel> {
  @Expose()
  @Type(() => TransactionResponseModel)
  @ApiProperty({ description: 'List of transactions', type: [TransactionResponseModel] })
  items: TransactionResponseModel[];

  @Expose()
  @ApiProperty({ description: 'Page number', example: 1 })
  page: number;

  @Expose()
  @ApiProperty({ description: 'Page size', example: 10 })
  perPage: number;

  @Expose()
  @ApiProperty({ description: 'Total pages', example: 10 })
  totalPages: number;

  @Expose()
  @ApiProperty({ description: 'Total count', example: 100 })
  totalCount: number;

  @Expose()
  @ApiProperty({ description: 'Has next page', example: true })
  hasNextPage: boolean;

  @Expose()
  @ApiProperty({ description: 'Has previous page', example: true })
  hasPreviousPage: boolean;
}

