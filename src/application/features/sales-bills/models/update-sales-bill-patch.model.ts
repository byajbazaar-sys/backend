import { EPaymentMode, EBillStatus, EDocumentType } from '../enums';

/** Header and totals fields updated on an existing sales bill. */
export interface UpdateSalesBillPatch {
  documentType?: EDocumentType;
  billNumber?: string;
  customerName?: string;
  customerMobile?: string;
  customerAddress?: string;
  customerState?: string;
  customerStateCode?: string;
  customerGstin?: string;
  customerPan?: string;
  customerPropName?: string;
  subtotal?: number;
  discount?: number;
  taxAmount?: number;
  cgstRate?: number;
  sgstRate?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  roundOff?: number;
  grandTotal?: number;
  totalPurchaseCost?: number;
  totalProfit?: number;
  paymentMode?: EPaymentMode;
  status?: EBillStatus;
}
