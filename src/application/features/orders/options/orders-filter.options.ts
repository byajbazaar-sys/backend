import { ESortOrder } from '@shared-libs';

import { EOrderStatus, EOrderType } from '../enums';

export class OrdersFilterOptions {
  createdBy: string;
  page?: number;
  limit?: number;
  status?: EOrderStatus;
  orderType?: EOrderType;
  customerId?: string;
  assignedTo?: string;
  dateFrom?: Date;
  dateTo?: Date;
  overdue?: boolean;
  search?: string;
  sortOrder?: ESortOrder;
  sortField?: string;
}
