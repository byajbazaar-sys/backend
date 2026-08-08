export interface BillLineUpdate {
  id: string;
  itemName?: string;
  sellingPrice?: number;
  makingCharges?: number;
  quantity?: number;
  lineTotal?: number;
  purchaseCost?: number;
  profitAmount?: number;
}
