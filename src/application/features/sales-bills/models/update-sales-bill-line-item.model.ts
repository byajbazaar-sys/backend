import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

import { EQuantityPricingMode } from '../enums';

export class UpdateSalesBillLineItemModel {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  makingCharges?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ enum: EQuantityPricingMode })
  @IsOptional()
  @IsEnum(EQuantityPricingMode)
  quantityPricingMode?: EQuantityPricingMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  hsnCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  huid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  purity?: string;

  @ApiPropertyOptional({ description: 'Gross weight per piece (g)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  grossWeight?: number;

  @ApiPropertyOptional({ description: 'Net weight per piece (g)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  netWeight?: number;

  @ApiPropertyOptional({ description: 'Less (stone) weight per piece (g)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lessWeight?: number;
}
