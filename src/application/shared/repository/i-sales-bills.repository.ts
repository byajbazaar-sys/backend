import { Paged } from '@shared-libs';
import { SalesBill } from '../../features/sales-bills/domain';

export const SALES_BILLS_REPOSITORY = 'SALES_BILLS_REPOSITORY';

export type SalesBillSortField = 'createdAt' | 'grandTotal';
export type SalesBillSortOrder = 'asc' | 'desc';

export interface SalesBillFilter {
  createdBy: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  paymentMode?: string;
  status?: string;
  customerId?: string;
  sortField?: SalesBillSortField;
  sortOrder?: SalesBillSortOrder;
}

export interface SalesBillPagination {
  pageNumber: number;
  pageSize: number;
}

export interface ISalesBillsRepository {
  create(bill: SalesBill): Promise<SalesBill>;
  findById(id: string): Promise<SalesBill | null>;
  findAll(filter: SalesBillFilter, pagination: SalesBillPagination): Promise<Paged<SalesBill>>;
  findByCustomerId(createdBy: string, customerId: string, pagination: SalesBillPagination): Promise<Paged<SalesBill>>;
  getNextBillSequence(createdBy: string, year: number): Promise<number>;
}
