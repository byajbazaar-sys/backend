import { ApiProperty } from '@nestjs/swagger';
import { IPageable } from '@shared-libs';
import { Expose, Type } from 'class-transformer';

import { LoanResponseModel } from './loan-response.model';

export class LoansPagedResponseModel implements IPageable<LoanResponseModel> {
  @Expose()
  @Type(() => LoanResponseModel)
  @ApiProperty({ description: 'List of loans', type: [LoanResponseModel] })
  items: LoanResponseModel[];

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Total amount remaining', example: 1000 })
  totalAmountRemaining: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Total amount paid', example: 1000 })
  totalAmountPaid: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Total interest paid', example: 100 })
  totalInterestPaid: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Total interest remaining', example: 100 })
  totalInterestRemaining: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Page number', example: 1 })
  page: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Page size', example: 10 })
  perPage: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Total pages', example: 10 })
  totalPages: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Total count', example: 100 })
  totalCount: number;

  @Expose()
  @ApiProperty({ description: 'Has next page', example: true })
  hasNextPage: boolean;

  @Expose()
  @ApiProperty({ description: 'Has previous page', example: true })
  hasPreviousPage: boolean;
}
