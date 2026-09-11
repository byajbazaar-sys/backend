import { Expose, Type } from 'class-transformer';

import { EOrderActivityType, EOrderStatus } from '../enums';

export class OrderActivity {
  @Expose()
  id?: string;

  @Expose()
  orderId?: string;

  @Expose()
  createdBy?: string;

  @Expose()
  activityType?: EOrderActivityType;

  @Expose()
  message?: string;

  @Expose()
  fromStatus?: EOrderStatus;

  @Expose()
  toStatus?: EOrderStatus;

  @Expose()
  @Type(() => Number)
  amount?: number;

  @Expose()
  metadata?: Record<string, unknown>;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;

  @Expose()
  createdByFirstName?: string;

  @Expose()
  createdByLastName?: string;
}
