import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class SalesBillLineItemResponseModel {
  @Expose()
  @ApiPropertyOptional()
  id?: string;

  @Expose()
  @ApiPropertyOptional()
  inventoryItemId?: string;

  @Expose()
  @ApiProperty()
  itemName: string;

  @Expose()
  @ApiProperty()
  sku: string;

  @Expose()
  @ApiPropertyOptional()
  barcode?: string;

  @Expose()
  @ApiPropertyOptional()
  metalType?: string;

  @Expose()
  @ApiPropertyOptional()
  purity?: string;

  @Expose()
  @ApiPropertyOptional()
  grossWeight?: number;

  @Expose()
  @ApiPropertyOptional()
  netWeight?: number;

  @Expose()
  @ApiPropertyOptional()
  lessWeight?: number;

  @Expose()
  @ApiPropertyOptional()
  hsnCode?: string;

  @Expose()
  @ApiPropertyOptional()
  huid?: string;

  @Expose()
  @ApiPropertyOptional()
  makingCharges?: number;

  @Expose()
  @ApiProperty()
  sellingPrice: number;

  @Expose()
  @ApiProperty()
  quantity: number;

  @Expose()
  @ApiProperty()
  lineTotal: number;
}
