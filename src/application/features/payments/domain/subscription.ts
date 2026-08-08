import { Expose, Type } from 'class-transformer';
import { ESubscriptionStatus } from './enums';

export class Subscription {
  @Expose()
  id?: string;

  @Expose()
  userId: string;

  @Expose()
  planId: string;

  @Expose()
  provider: string;

  @Expose()
  providerSubscriptionId?: string;

  @Expose()
  providerCustomerId?: string;

  @Expose()
  status: ESubscriptionStatus;

  @Expose()
  @Type(() => Date)
  currentStart?: Date;

  @Expose()
  @Type(() => Date)
  currentEnd?: Date;

  @Expose()
  @Type(() => Date)
  nextBillingAt?: Date;

  @Expose()
  cancelAtPeriodEnd?: boolean;

  @Expose()
  @Type(() => Date)
  cancelledAt?: Date;

  @Expose()
  amount: number;

  @Expose()
  currency: string;

  @Expose()
  couponId?: string;

  @Expose()
  discountAmount?: number;

  @Expose()
  notes?: Record<string, unknown>;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;

  @Expose()
  @Type(() => Date)
  updatedAt?: Date;
}
