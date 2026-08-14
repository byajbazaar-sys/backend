import { Expose } from 'class-transformer';

import { EInventoryItemStatus, EMakingChargeMode, EMetalType } from '../enums';

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
  huid?: string;

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
  lessWeight?: number;

  @Expose()
  stoneWeight?: number;

  @Expose()
  makingCharges?: number;

  @Expose()
  makingChargeMode?: EMakingChargeMode;

  @Expose()
  wastagePercentage?: number;

  @Expose()
  purchasePrice?: number;

  @Expose()
  purchaseRatePerGram?: number;

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
  stockQuantity?: number;

  @Expose()
  supplierName?: string;

  @Expose()
  createdBy?: string;

  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;
}
