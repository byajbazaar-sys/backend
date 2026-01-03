import { IPageable } from '@shared-libs';
import { Expose } from 'class-transformer';
import { CustomerResponseModel } from './customers.response.model';
import { ApiProperty } from '@nestjs/swagger';

export class CustomersPagedResponseModel implements IPageable<CustomerResponseModel> {
  @Expose()
  @ApiProperty({ description: 'List of customers', type: [CustomerResponseModel] })
  items: CustomerResponseModel[];

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
