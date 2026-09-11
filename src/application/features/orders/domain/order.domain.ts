import { Expose, Type } from 'class-transformer';

import { EOrderPriority, EOrderStatus, EOrderType } from '../enums';
import { OrderAttachment } from './order-attachment.domain';

export class Order {
  @Expose()
  id?: string;

  @Expose()
  orderNumber?: string;

  @Expose()
  customerId?: string;

  @Expose()
  createdBy?: string;

  @Expose()
  assignedTo?: string;

  @Expose()
  orderType?: EOrderType;

  @Expose()
  status?: EOrderStatus;

  @Expose()
  priority?: EOrderPriority;

  @Expose()
  title?: string;

  @Expose()
  description?: string;

  @Expose()
  @Type(() => Date)
  dueDate?: Date;

  @Expose()
  @Type(() => Number)
  estimatedAmount?: number;

  @Expose()
  @Type(() => Number)
  finalAmount?: number;

  @Expose()
  @Type(() => Number)
  totalAmount?: number;

  @Expose()
  @Type(() => Number)
  paidAmount?: number;

  @Expose()
  notes?: string;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;

  @Expose()
  @Type(() => Date)
  updatedAt?: Date;

  @Expose()
  customerFirstName?: string;

  @Expose()
  customerLastName?: string;

  @Expose()
  customerPhone?: string;

  @Expose()
  assignedToFirstName?: string;

  @Expose()
  assignedToLastName?: string;

  @Expose()
  isOverdue?: boolean;

  @Expose()
  attachments?: OrderAttachment[];
}
