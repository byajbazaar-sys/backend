import { ESubscriptionStatus } from '../domain/enums';

export interface SubscriptionPatch {
  planId?: string;
  provider?: string;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string;
  status?: ESubscriptionStatus;
  currentStart?: Date | null;
  currentEnd?: Date | null;
  nextBillingAt?: Date | null;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: Date | null;
  amount?: number;
  currency?: string;
  couponId?: string;
  discountAmount?: number;
  notes?: Record<string, unknown>;
}
