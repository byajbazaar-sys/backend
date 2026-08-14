import { ApiProperty } from '@nestjs/swagger';
import { IPageable } from '@shared-libs';
import { Expose, Type } from 'class-transformer';

import { CustomerResponseModel } from './customers.response.model';

export class CustomersPagedResponseModel implements IPageable<CustomerResponseModel> {
  @Expose()
  @Type(() => CustomerResponseModel)
  @ApiProperty({ description: 'List of customers', type: [CustomerResponseModel] })
  items: CustomerResponseModel[];

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
