import { ApiPropertyOptional } from '@nestjs/swagger';
import { ESortOrder } from '@shared-libs';
import { Expose } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { ELoanStatus } from '../enums';

export class ListLoansQueryRequestModel {
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
    example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327',
    description: 'Filter by customer ID',
    required: false,
  })
  customerId?: string;

  @Expose()
  @ApiPropertyOptional({
    enum: ELoanStatus,
    example: ELoanStatus.OPEN,
    description: 'Filter by loan status (defaults to OPEN if not specified)',
    required: false,
  })
  @IsEnum(ELoanStatus)
  @IsOptional()
  status?: ELoanStatus;
}

