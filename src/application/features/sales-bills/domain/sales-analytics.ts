export interface SalesDailyPoint {
  date: string;
  revenue: number;
  billCount: number;
}

export interface SalesTopItem {
  sku: string;
  itemName: string;
  quantity: number;
  revenue: number;
  metalType?: string;
}

export interface SalesMetalBreakdown {
  metalType: string;
  revenue: number;
  quantity: number;
  netWeight: number;
}

export interface SalesPaymentBreakdown {
  paymentMode: string;
  count: number;
  revenue: number;
}

export interface SalesAnalytics {
  billCount: number;
  revenue: number;
  avgBillValue: number;
  dailySeries: SalesDailyPoint[];
  topItems: SalesTopItem[];
  byMetalType: SalesMetalBreakdown[];
  byPaymentMode: SalesPaymentBreakdown[];
}
