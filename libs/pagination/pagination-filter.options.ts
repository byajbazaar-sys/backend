import { Expose, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ESortOrder } from '@shared-libs';

export class PaginationFilterOptions {
  @Expose()
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  pageNumber?: number;

  @Expose()
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @Expose()
  @IsOptional()
  @IsEnum(ESortOrder)
  sortOrder?: ESortOrder;

  @Expose()
  @IsOptional()
  @IsString()
  sortField?: string;
}
