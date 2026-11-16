import { Paged } from '@shared-libs';

import { BillLog } from '../domain/bill-log';

export const BILL_LOGS_REPOSITORY = 'IBillLogsRepository';

export interface BillLogsQuery {
  userId: string;
  billId?: string;
  action?: string;
  pageNumber?: number;
  pageSize?: number;
}

export interface IBillLogsRepository {
  create(log: BillLog): Promise<BillLog>;
  /** Newest first, with the performer's name. */
  find(query: BillLogsQuery): Promise<Paged<BillLog>>;
}
