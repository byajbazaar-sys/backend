import { ApiPropertyOptional } from '@nestjs/swagger';
import { ESortOrder } from '@shared-libs';
import { Expose, Type } from 'class-transformer';

export class ListCustomersQueryRequestModel {
  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ example: 10, description: 'Number of items per page', required: false })
  pageSize: number;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ example: 0, description: 'Page number (0-based)', required: false })
  pageNumber: number;

  @Expose()
  @ApiPropertyOptional({ enum: ESortOrder, example: ESortOrder.DESC, description: 'Sort order', required: false })
  sortOrder: ESortOrder;

  @Expose()
  @ApiPropertyOptional({ example: 'createdAt', description: 'Field to sort by', required: false })
  sortField: string;

  @Expose()
  @ApiPropertyOptional({
    example: 'customer name',
    description: 'Search by customer name (partial match)',
    required: false,
  })
  name?: string;
}
