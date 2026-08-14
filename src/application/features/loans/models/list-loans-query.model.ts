import { ApiPropertyOptional } from '@nestjs/swagger';
import { ESortOrder } from '@shared-libs';
import { Expose, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

import { ELoanStatus } from '../enums';

export class ListLoansQueryRequestModel {
  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ example: 10, description: 'Number of items per page', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ example: 0, description: 'Page number (0-based)', required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  pageNumber?: number;

  @Expose()
  @ApiPropertyOptional({ enum: ESortOrder, example: ESortOrder.DESC, description: 'Sort order', required: false })
  @IsOptional()
  @IsEnum(ESortOrder)
  sortOrder?: ESortOrder;

  @Expose()
  @ApiPropertyOptional({ example: 'createdAt', description: 'Field to sort by', required: false })
  @IsOptional()
  @IsString()
  sortField?: string;

  @Expose()
  @ApiPropertyOptional({
    example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327',
    description: 'Filter by customer ID',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @Expose()
  @ApiPropertyOptional({
    enum: ELoanStatus,
    example: ELoanStatus.OPEN,
    description: 'Filter by loan status (defaults to OPEN if not specified)',
    required: false,
  })
  @IsOptional()
  @IsEnum(ELoanStatus)
  status?: ELoanStatus;
}
