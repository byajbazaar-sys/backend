export interface CreateSalesBillLineEntityInput {
  inventoryItemId?: string;
  itemName: string;
  sku: string;
  barcode?: string;
  metalType?: string;
  purity?: string;
  grossWeight?: number;
  netWeight?: number;
  lessWeight?: number;
  hsnCode?: string;
  huid?: string;
  makingCharges?: number;
  sellingPrice: number;
  quantity: number;
  quantityPricingMode?: string;
  lineTotal: number;
  purchaseRatePerGram?: number;
  purchaseCost?: number;
  profitAmount?: number;
}
