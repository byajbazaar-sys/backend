import { Paged } from '@shared-libs';

import { BillLog } from '../domain';
import { BillLogsQuery } from './bill-logs-query';

export const BILL_LOGS_REPOSITORY = 'IBillLogsRepository';

export interface IBillLogsRepository {
  create(log: BillLog): Promise<BillLog>;
  /** Newest first, with the performer's name. */
  find(query: BillLogsQuery): Promise<Paged<BillLog>>;
}
