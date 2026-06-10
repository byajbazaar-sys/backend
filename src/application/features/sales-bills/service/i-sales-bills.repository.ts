import { Paged } from '@shared-libs';
import { SalesBill, SalesAnalytics } from '../domain';
import { SalesAnalyticsFilterOptions, SalesBillsFilterOptions } from '../options';

export const SALES_BILLS_REPOSITORY = 'SALES_BILLS_REPOSITORY';

export interface ISalesBillsRepository {
  create(bill: SalesBill, markSoldInventoryIds?: string[]): Promise<SalesBill>;
  findById(id: string): Promise<SalesBill | null>;
  findAll(params: SalesBillsFilterOptions): Promise<Paged<SalesBill>>;
  findByCustomerId(customerId: string, params: SalesBillsFilterOptions): Promise<Paged<SalesBill>>;
  getNextBillSequence(createdBy: string, year: number): Promise<number>;
  getAnalytics(params: SalesAnalyticsFilterOptions): Promise<SalesAnalytics>;
}
