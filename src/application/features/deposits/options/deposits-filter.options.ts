import { ESortOrder } from '@shared-libs';

import { EDepositStatus } from '../enums';

export class DepositsFilterOptions {
  createdBy: string;
  page?: number;
  limit?: number;
  status?: EDepositStatus;
  search?: string;
  sortOrder?: ESortOrder;
  sortField?: string;
  customerId?: string;
}
