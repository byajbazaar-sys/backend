import { EOrderPriority, EOrderStatus, EOrderType } from '../enums';

export interface CreateOrderInput {
  orderNumber: string;
  customerId: string;
  createdBy: string;
  assignedTo?: string;
  orderType: EOrderType;
  status: EOrderStatus;
  priority: EOrderPriority;
  title?: string;
  description?: string;
  dueDate?: Date;
  estimatedAmount: number;
  finalAmount?: number;
  totalAmount: number;
  paidAmount: number;
  notes?: string;
}
