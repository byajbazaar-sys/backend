import { EInventoryItemStatus, EMakingChargeMode, EMetalType } from '../enums';

/** Persistable inventory item columns for repository updates. */
export interface InventoryItemEntityUpdateInput {
  itemCode?: string;
  itemName?: string;
  description?: string;
  categoryId?: string;
  metalType?: EMetalType;
  purity?: string;
  grossWeight?: number;
  netWeight?: number;
  lessWeight?: number;
  stoneWeight?: number;
  makingCharges?: number;
  makingChargeMode?: EMakingChargeMode;
  wastagePercentage?: number;
  purchasePrice?: number;
  purchaseRatePerGram?: number;
  sellingPrice?: number;
  status?: EInventoryItemStatus;
  imageUrls?: string[];
  location?: string;
  hallmarked?: boolean;
  stockQuantity?: number;
  supplierName?: string;
  isCatalogVisible?: boolean;
  huid?: string;
  qrValue?: string;
}
