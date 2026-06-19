import { Expose } from 'class-transformer';

export class InventoryItemSale {
  @Expose()
  lineItemId: string;

  @Expose()
  billId: string;

  @Expose()
  billNumber: string;

  @Expose()
  issuedAt: Date;

  @Expose()
  quantity: number;

  @Expose()
  sellingPrice: number;

  @Expose()
  lineTotal: number;

  @Expose()
  purchaseCost: number;

  @Expose()
  profitAmount: number;
}
