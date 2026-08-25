import { EPaymentMode, EBillStatus, EDocumentType } from '../enums';

export interface CreateSalesBillEntityInput {
  createdBy: string;
  billNumber: string;
  documentType: EDocumentType;
  customerName: string;
  customerMobile?: string;
  customerId?: string;
  customerAddress?: string;
  customerState?: string;
  customerStateCode?: string;
  customerGstin?: string;
  customerPan?: string;
  customerPropName?: string;
  subtotal: number;
  discount: number;
  taxAmount: number;
  cgstRate?: number;
  sgstRate?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  roundOff?: number;
  goldRate24k?: number;
  metalRates?: Record<string, number>;
  grandTotal: number;
  amountReceived?: number;
  depositApplied?: number;
  totalPurchaseCost?: number;
  totalProfit?: number;
  paymentMode: EPaymentMode;
  status: EBillStatus;
  issuedAt: Date;
}

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
  lineTotal: number;
  purchaseRatePerGram?: number;
  purchaseCost?: number;
  profitAmount?: number;
}
