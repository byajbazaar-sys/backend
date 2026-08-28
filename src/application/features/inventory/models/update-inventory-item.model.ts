import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

import { EInventoryItemStatus, EMakingChargeMode, EMetalType } from '../enums';

/** Explicit optional update payload — all fields optional for partial inventory item updates. */
export class UpdateInventoryItemRequestModel {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  itemCode?: string;

  @ApiPropertyOptional({ example: '22K Gold Ring' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  itemName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: EMetalType })
  @IsOptional()
  @IsEnum(EMetalType)
  metalType?: EMetalType;

  @ApiPropertyOptional({ example: '22K' })
  @IsOptional()
  @IsString()
  purity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  grossWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  netWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  lessWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  stoneWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  makingCharges?: number;

  @ApiPropertyOptional({ enum: EMakingChargeMode })
  @IsOptional()
  @IsEnum(EMakingChargeMode)
  makingChargeMode?: EMakingChargeMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  wastagePercentage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchaseRatePerGram?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional({ enum: EInventoryItemStatus })
  @IsOptional()
  @IsEnum(EInventoryItemStatus)
  status?: EInventoryItemStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  imageUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hallmarked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  supplierName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCatalogVisible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  huid?: string;
}
