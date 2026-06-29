import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { EInventoryItemStatus, EMetalType } from '../enums';

export class InventoryItemResponseModel {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty({ example: 'RK250001' })
  sku: string;

  @Expose()
  @ApiProperty({ example: 'RK250001' })
  barcode: string;

  @Expose()
  @ApiPropertyOptional({ description: 'JSON payload encoded in item QR label' })
  qrValue?: string;

  @Expose()
  @ApiPropertyOptional()
  barcodeImageUrl?: string;

  @Expose()
  @ApiPropertyOptional()
  qrImageUrl?: string;

  @Expose()
  @ApiPropertyOptional()
  itemCode?: string;

  @Expose()
  @ApiProperty()
  itemName: string;

  @Expose()
  @ApiPropertyOptional()
  description?: string;

  @Expose()
  @ApiProperty()
  categoryId: string;

  @Expose()
  @ApiPropertyOptional()
  categoryName?: string;

  @Expose()
  @ApiProperty({ enum: EMetalType })
  metalType: EMetalType;

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
  stoneWeight?: number;

  @Expose()
  @ApiPropertyOptional()
  makingCharges?: number;

  @Expose()
  @ApiPropertyOptional()
  wastagePercentage?: number;

  @Expose()
  @ApiPropertyOptional()
  purchasePrice?: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Purchase rate per gram (₹)' })
  purchaseRatePerGram?: number;

  @Expose()
  @ApiPropertyOptional()
  sellingPrice?: number;

  @Expose()
  @ApiProperty({ enum: EInventoryItemStatus })
  status: EInventoryItemStatus;

  @Expose()
  @ApiPropertyOptional({ type: [String] })
  imageUrls?: string[];

  @Expose()
  @ApiPropertyOptional()
  location?: string;

  @Expose()
  @ApiPropertyOptional()
  hallmarked?: boolean;

  @Expose()
  @ApiPropertyOptional({ example: 1 })
  stockQuantity?: number;

  @Expose()
  @ApiPropertyOptional()
  supplierName?: string;

  @Expose()
  @ApiPropertyOptional()
  huid?: string;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  @Expose()
  @ApiProperty()
  updatedAt: Date;
}
