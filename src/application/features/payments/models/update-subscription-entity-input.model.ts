import { ESubscriptionStatus } from '../domain/enums';

export interface UpdateSubscriptionEntityInput {
  planId?: string;
  provider?: string;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  status?: ESubscriptionStatus;
  currentStart?: Date;
  currentEnd?: Date;
  nextBillingAt?: Date;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: Date;
  amount?: number;
  currency?: string;
  couponId?: string;
  discountAmount?: number;
  notes?: Record<string, unknown>;
}
