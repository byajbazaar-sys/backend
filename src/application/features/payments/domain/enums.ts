export enum ECouponType {
  Flat = 'flat',
  Percentage = 'percentage',
}

export enum ESubscriptionStatus {
  Created = 'created',
  Authenticated = 'authenticated',
  Active = 'active',
  Pending = 'pending',
  Halted = 'halted',
  Cancelled = 'cancelled',
  Completed = 'completed',
  Expired = 'expired',
  Paused = 'paused',
}

export const ACTIVE_SUBSCRIPTION_STATUSES: ESubscriptionStatus[] = [
  ESubscriptionStatus.Active,
];

export const BLOCKING_SUBSCRIPTION_STATUSES: ESubscriptionStatus[] = [
  ESubscriptionStatus.Expired,
  ESubscriptionStatus.Cancelled,
  ESubscriptionStatus.Halted,
  ESubscriptionStatus.Pending,
  ESubscriptionStatus.Completed,
];

export const DUPLICATE_BLOCKING_STATUSES: ESubscriptionStatus[] = [
  ESubscriptionStatus.Created,
  ESubscriptionStatus.Authenticated,
  ESubscriptionStatus.Active,
  ESubscriptionStatus.Pending,
  ESubscriptionStatus.Paused,
];
