import { Paged } from '@shared-libs';
import { SalesBill } from '../domain';
import { SalesAnalytics } from '../domain';
import { CreateSalesBillRequestModel, ListSalesBillsQueryModel, UpdateSalesBillRequestModel } from '../models';

export const SALES_BILL_SERVICE = 'SALES_BILL_SERVICE';

export interface ISalesBillService {
  create(data: CreateSalesBillRequestModel, userId: string): Promise<SalesBill>;
  getById(id: string, userId: string): Promise<SalesBill>;
  list(userId: string, query: ListSalesBillsQueryModel): Promise<Paged<SalesBill>>;
  listByCustomer(customerId: string, userId: string, query: ListSalesBillsQueryModel): Promise<Paged<SalesBill>>;
  getAnalytics(userId: string, dateFrom?: string, dateTo?: string, documentType?: string): Promise<SalesAnalytics>;
  convertToNormalBill(id: string, userId: string): Promise<SalesBill>;
  update(id: string, data: UpdateSalesBillRequestModel, userId: string): Promise<SalesBill>;
  delete(id: string, userId: string): Promise<void>;
}
