import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

import { EInventoryItemStatus, EInventoryItemSortOrder } from '../enums';

export const INVENTORY_SORT_FIELDS = ['createdAt', 'netWeight', 'sellingPrice', 'itemName'] as const;
export type InventorySortField = (typeof INVENTORY_SORT_FIELDS)[number];

export class ListInventoryItemsQueryModel {
  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  pageNumber?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: EInventoryItemStatus })
  @IsOptional()
  @IsEnum(EInventoryItemStatus)
  status?: EInventoryItemStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metalType?: string;

  @ApiPropertyOptional({ description: 'Filter by public catalog visibility' })
  @Expose()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isCatalogVisible?: boolean;

  @ApiPropertyOptional({ enum: EInventoryItemSortOrder, default: EInventoryItemSortOrder.Desc })
  @IsOptional()
  @IsEnum(EInventoryItemSortOrder)
  sortOrder?: EInventoryItemSortOrder;

  @ApiPropertyOptional({ enum: INVENTORY_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(INVENTORY_SORT_FIELDS)
  sortBy?: InventorySortField;

  @ApiPropertyOptional({ description: 'Purity, e.g. 22K (case-insensitive exact match)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  purity?: string;

  @ApiPropertyOptional({ description: 'Minimum weight in grams (net weight, or gross when net is not set)' })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  minWeight?: number;

  @ApiPropertyOptional({ description: 'Maximum weight in grams' })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxWeight?: number;

  @ApiPropertyOptional({ description: 'Minimum selling price (₹)' })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum selling price (₹)' })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Added on or after this date (YYYY-MM-DD, India time)' })
  @IsOptional()
  @IsDateString()
  addedFrom?: string;

  @ApiPropertyOptional({ description: 'Added on or before this date (YYYY-MM-DD, India time)' })
  @IsOptional()
  @IsDateString()
  addedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  hallmarked?: boolean;

  @ApiPropertyOptional({ description: 'true = only items with a photo, false = only items without' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  hasPhoto?: boolean;
}
