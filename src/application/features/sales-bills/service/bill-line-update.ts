export interface BillLineUpdate {
  id: string;
  itemName?: string;
  sellingPrice?: number;
  makingCharges?: number;
  quantity?: number;
  quantityPricingMode?: string;
  sku?: string;
  hsnCode?: string;
  huid?: string;
  purity?: string;
  grossWeight?: number;
  netWeight?: number;
  lessWeight?: number;
  lineTotal?: number;
  purchaseCost?: number;
  profitAmount?: number;
}
