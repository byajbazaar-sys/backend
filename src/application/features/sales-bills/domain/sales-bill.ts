import { Expose, Type } from 'class-transformer';
import { EPaymentMode, EBillStatus } from '../enums';
import { SalesBillLineItem } from './sales-bill-line-item';

export class SalesBill {
  @Expose()
  id?: string;

  @Expose()
  createdBy?: string;

  @Expose()
  billNumber: string;

  @Expose()
  customerName: string;

  @Expose()
  customerMobile?: string;

  @Expose()
  customerId?: string;

  @Expose()
  subtotal: number;

  @Expose()
  discount: number;

  @Expose()
  taxAmount: number;

  @Expose()
  grandTotal: number;

  @Expose()
  paymentMode: EPaymentMode;

  @Expose()
  status: EBillStatus;

  @Expose()
  issuedAt: Date;

  @Expose()
  @Type(() => SalesBillLineItem)
  items?: SalesBillLineItem[];

  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;
}
