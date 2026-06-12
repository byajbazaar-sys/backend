import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateSalesBillLineItemModel {
  @ApiPropertyOptional({ description: 'Inventory item UUID when linked to stock' })
  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;

  @ApiProperty()
  @IsString()
  itemName: string;

  @ApiProperty()
  @IsString()
  sku: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metalType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  grossWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  netWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hsnCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  huid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  makingCharges?: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  sellingPrice: number;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;
}
