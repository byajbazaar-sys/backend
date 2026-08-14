import { SalesDailyPoint } from './sales-daily-point';
import { SalesDocumentTypeBreakdown } from './sales-document-type-breakdown';
import { SalesMetalBreakdown } from './sales-metal-breakdown';
import { SalesPaymentBreakdown } from './sales-payment-breakdown';
import { SalesTopItem } from './sales-top-item';

export interface SalesAnalytics {
  billCount: number;
  revenue: number;
  avgBillValue: number;
  totalPurchaseCost: number;
  totalProfit: number;
  dailySeries: SalesDailyPoint[];
  topItems: SalesTopItem[];
  byMetalType: SalesMetalBreakdown[];
  byPaymentMode: SalesPaymentBreakdown[];
  byDocumentType: SalesDocumentTypeBreakdown[];
}
