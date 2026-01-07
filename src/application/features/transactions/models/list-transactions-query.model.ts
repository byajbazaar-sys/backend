import { ApiPropertyOptional } from '@nestjs/swagger';
import { ESortOrder } from '@shared-libs';
import { Expose } from 'class-transformer';

export class ListTransactionsQueryRequestModel {
  @Expose()
  @ApiPropertyOptional({ example: 10, description: 'Number of items per page', required: false })
  pageSize: number;

  @Expose()
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
    example: '507f1f77bcf86cd799439011',
    description: 'Filter by loan ID',
    required: false,
  })
  loanId?: string;
}

