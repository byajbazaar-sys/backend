import { Expose } from 'class-transformer';
import { EInventoryItemStatus, EMetalType } from '../enums';

export class InventoryItem {
  @Expose()
  id?: string;

  @Expose()
  sku?: string;

  @Expose()
  barcode?: string;

  @Expose()
  qrValue?: string;

  @Expose()
  barcodeImageUrl?: string;

  @Expose()
  qrImageUrl?: string;

  @Expose()
  itemCode?: string;

  @Expose()
  itemName: string;

  @Expose()
  description?: string;

  @Expose()
  categoryId: string;

  @Expose()
  categoryName?: string;

  @Expose()
  metalType: EMetalType;

  @Expose()
  purity?: string;

  @Expose()
  grossWeight?: number;

  @Expose()
  netWeight?: number;

  @Expose()
  stoneWeight?: number;

  @Expose()
  makingCharges?: number;

  @Expose()
  wastagePercentage?: number;

  @Expose()
  purchasePrice?: number;

  @Expose()
  sellingPrice?: number;

  @Expose()
  status?: EInventoryItemStatus;

  @Expose()
  imageUrls?: string[];

  @Expose()
  location?: string;

  @Expose()
  hallmarked?: boolean;

  @Expose()
  createdBy?: string;

  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;
}
