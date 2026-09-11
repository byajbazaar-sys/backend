import { EOrderPriority, EOrderStatus, EOrderType } from '../enums';

export interface UpdateOrderPatch {
  orderType?: EOrderType;
  status?: EOrderStatus;
  priority?: EOrderPriority;
  title?: string;
  description?: string;
  dueDate?: Date;
  estimatedAmount?: number;
  finalAmount?: number | null;
  totalAmount?: number;
  paidAmount?: number;
  assignedTo?: string;
  notes?: string;
}
