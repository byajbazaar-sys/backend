import { ApiPropertyOptional } from '@nestjs/swagger';
import { ESortOrder } from '@shared-libs';
import { Expose, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListCustomersQueryRequestModel {
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
    example: 'customer name',
    description: 'Search by customer name (partial match)',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;
}
