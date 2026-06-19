import { Expose } from 'class-transformer';

export class SalesBillLineItem {
  @Expose()
  id?: string;

  @Expose()
  billId?: string;

  @Expose()
  inventoryItemId?: string;

  @Expose()
  itemName: string;

  @Expose()
  sku: string;

  @Expose()
  barcode?: string;

  @Expose()
  metalType?: string;

  @Expose()
  purity?: string;

  @Expose()
  grossWeight?: number;

  @Expose()
  netWeight?: number;

  @Expose()
  lessWeight?: number;

  @Expose()
  hsnCode?: string;

  @Expose()
  huid?: string;

  @Expose()
  makingCharges?: number;

  @Expose()
  sellingPrice: number;

  @Expose()
  quantity: number;

  @Expose()
  lineTotal: number;

  @Expose()
  purchaseRatePerGram?: number;

  @Expose()
  purchaseCost?: number;

  @Expose()
  profitAmount?: number;
}
