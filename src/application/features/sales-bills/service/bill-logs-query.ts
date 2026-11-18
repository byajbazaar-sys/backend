export interface BillLogsQuery {
  userId: string;
  billId?: string;
  action?: string;
  pageNumber?: number;
  pageSize?: number;
}
