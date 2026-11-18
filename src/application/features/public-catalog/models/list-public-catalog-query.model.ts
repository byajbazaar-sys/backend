import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

import { PUBLIC_CATALOG_SORTS, PublicCatalogSort } from './public-catalog-sort';

export class ListPublicCatalogQueryModel {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  metalType?: string;

  @ApiPropertyOptional({ description: 'e.g. 22K' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  purity?: string;

  @ApiPropertyOptional({ description: 'Grams (net weight, or gross when net is not set)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxWeight?: number;

  @ApiPropertyOptional({ description: '₹ (ignored when the shop hides prices)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true ? true : value === 'false' || value === false ? false : undefined,
  )
  hallmarked?: boolean;

  @ApiPropertyOptional({ enum: PUBLIC_CATALOG_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(PUBLIC_CATALOG_SORTS)
  sort?: PublicCatalogSort;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  pageNumber?: number;

  @ApiPropertyOptional({ default: 24 })
  @IsOptional()
  @Type(() => Number)
  @Max(60)
  pageSize?: number;
}
