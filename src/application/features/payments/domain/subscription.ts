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
  providerSubscriptionId?: string | null;

  @Expose()
  providerCustomerId?: string | null;

  @Expose()
  status: ESubscriptionStatus;

  @Expose()
  @Type(() => Date)
  currentStart?: Date | null;

  @Expose()
  @Type(() => Date)
  currentEnd?: Date | null;

  @Expose()
  @Type(() => Date)
  nextBillingAt?: Date | null;

  @Expose()
  cancelAtPeriodEnd?: boolean;

  @Expose()
  @Type(() => Date)
  cancelledAt?: Date | null;

  @Expose()
  amount: number;

  @Expose()
  currency: string;

  @Expose()
  couponId?: string | null;

  @Expose()
  discountAmount?: number;

  @Expose()
  notes?: Record<string, unknown> | null;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;

  @Expose()
  @Type(() => Date)
  updatedAt?: Date;
}
