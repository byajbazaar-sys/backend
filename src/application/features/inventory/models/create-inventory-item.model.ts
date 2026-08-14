import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

import { EInventoryItemStatus, EMakingChargeMode, EMetalType } from '../enums';

export class CreateInventoryItemRequestModel {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  itemCode?: string;

  @ApiProperty({ example: '22K Gold Ring' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  itemName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiProperty({ enum: EMetalType })
  @IsEnum(EMetalType)
  metalType: EMetalType;

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

  @ApiPropertyOptional({
    enum: EMakingChargeMode,
    description: 'FIXED = amount (₹), PERCENT = % of metal value, PER_PC = per piece (₹), PER_GRAM = per gram (₹)',
    default: EMakingChargeMode.Fixed,
  })
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

  @ApiPropertyOptional({ description: 'Purchase rate per gram (₹)' })
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

  @ApiPropertyOptional({ example: 1, description: 'Available stock quantity' })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @ApiPropertyOptional({ example: 'Shree Gold Suppliers' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  supplierName?: string;

  @ApiPropertyOptional({ example: false, description: 'Show this item on the public catalog' })
  @IsOptional()
  @IsBoolean()
  isCatalogVisible?: boolean;

  @ApiPropertyOptional({ description: 'Hallmark Unique Identification' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  huid?: string;
}
