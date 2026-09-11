import { Expose, Type } from 'class-transformer';

import { EOrderPriority, EOrderType } from '../enums';

export class CreateOrderData {
  @Expose()
  customerId: string;

  @Expose()
  orderType: EOrderType;

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

  /** @deprecated Use estimatedAmount */
  @Expose()
  @Type(() => Number)
  totalAmount?: number;

  @Expose()
  assignedTo?: string;

  @Expose()
  notes?: string;
}
