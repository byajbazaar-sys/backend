import { Paged } from '@shared-libs';

import { BulkDeleteResult } from '../../../shared';
import { BillLog, SalesBill, SalesAnalytics, GstCsvExportResult } from '../domain';
import { EBillLogAction } from '../enums';
import type { BillActionContext } from './bill-action-context';
import { BillLogsQuery } from './bill-logs-query';
import { CreateSalesBillRequestModel, ListSalesBillsQueryModel, UpdateSalesBillRequestModel } from '../models';

export const SALES_BILL_SERVICE = 'SALES_BILL_SERVICE';

export interface ISalesBillService {
  create(data: CreateSalesBillRequestModel, userId: string, context?: BillActionContext): Promise<SalesBill>;
  getById(id: string, userId: string): Promise<SalesBill>;
  list(userId: string, query: ListSalesBillsQueryModel): Promise<Paged<SalesBill>>;
  exportGstCsv(userId: string, query: ListSalesBillsQueryModel): Promise<GstCsvExportResult>;
  listByCustomer(customerId: string, userId: string, query: ListSalesBillsQueryModel): Promise<Paged<SalesBill>>;
  getAnalytics(userId: string, dateFrom?: string, dateTo?: string, documentType?: string): Promise<SalesAnalytics>;
  convertToNormalBill(id: string, userId: string, context?: BillActionContext): Promise<SalesBill>;
  update(
    id: string,
    data: UpdateSalesBillRequestModel,
    userId: string,
    context?: BillActionContext,
  ): Promise<SalesBill>;
  delete(id: string, userId: string, context?: BillActionContext): Promise<void>;
  bulkDelete(ids: string[], userId: string, context?: BillActionContext): Promise<BulkDeleteResult>;
  getLogs(billId: string, userId: string, pageNumber?: number, pageSize?: number): Promise<Paged<BillLog>>;
  getActivity(query: Omit<BillLogsQuery, 'billId'>): Promise<Paged<BillLog>>;
  recordClientEvent(billId: string, action: EBillLogAction, userId: string, context?: BillActionContext): Promise<void>;
}
