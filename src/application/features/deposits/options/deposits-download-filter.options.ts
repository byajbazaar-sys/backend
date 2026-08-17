import { EDepositStatus } from '../enums';

export class DepositsDownloadFilterOptions {
  createdBy: string;
  status?: EDepositStatus;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  reportType?: 'statement' | 'customer-history' | 'active' | 'refunds' | 'daily-collection';
}
