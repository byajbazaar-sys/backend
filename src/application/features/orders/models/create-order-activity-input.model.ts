import { EOrderActivityType, EOrderStatus } from '../enums';

export interface CreateOrderActivityInput {
  orderId: string;
  createdBy: string;
  activityType: EOrderActivityType;
  message?: string;
  fromStatus?: EOrderStatus;
  toStatus?: EOrderStatus;
  amount?: number;
  metadata?: Record<string, unknown>;
}
