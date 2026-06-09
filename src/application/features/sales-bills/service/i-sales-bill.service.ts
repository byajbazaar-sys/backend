import { Paged } from '@shared-libs';
import { SalesBill } from '../domain';
import { CreateSalesBillRequestModel, ListSalesBillsQueryModel } from '../models';

export const SALES_BILL_SERVICE = 'SALES_BILL_SERVICE';

export interface ISalesBillService {
  create(data: CreateSalesBillRequestModel, userId: string): Promise<SalesBill>;
  getById(id: string, userId: string): Promise<SalesBill>;
  list(userId: string, query: ListSalesBillsQueryModel): Promise<Paged<SalesBill>>;
  listByCustomer(customerId: string, userId: string, query: ListSalesBillsQueryModel): Promise<Paged<SalesBill>>;
}
