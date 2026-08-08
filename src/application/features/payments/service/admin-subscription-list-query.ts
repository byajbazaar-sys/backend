import { AdminSubscriptionStatusFilter } from './admin-subscription-status-filter';

export interface AdminSubscriptionListQuery {
  page: number;
  pageSize: number;
  status?: AdminSubscriptionStatusFilter;
  search?: string;
}
