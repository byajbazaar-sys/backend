import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

import { EInventoryItemStatus, EInventoryItemSortOrder } from '../enums';

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

  @ApiPropertyOptional({ enum: EInventoryItemSortOrder, default: EInventoryItemSortOrder.Desc })
  @IsOptional()
  @IsEnum(EInventoryItemSortOrder)
  sortOrder?: EInventoryItemSortOrder;
}
