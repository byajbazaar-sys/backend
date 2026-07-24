import { EDepositStatus } from '../enums';
import { ESortOrder } from '@shared-libs';

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

export class DepositsDownloadFilterOptions {
  createdBy: string;
  status?: EDepositStatus;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  reportType?: 'statement' | 'customer-history' | 'active' | 'refunds' | 'daily-collection';
}
