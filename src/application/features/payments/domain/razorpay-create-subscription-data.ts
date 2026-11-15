import { Expose, Type } from 'class-transformer';

import { RazorpaySubscriptionNotifyInfo } from './razorpay-subscription-notify-info';

export class RazorpayCreateSubscriptionData {
  @Expose()
  planId: string;

  @Expose()
  @Type(() => Number)
  totalCount?: number;

  @Expose()
  notes?: Record<string, string>;

  /** Unix seconds when recurring billing starts. Set when the first period is paid upfront. */
  @Expose()
  @Type(() => Number)
  startAt?: number;

  /** One-off amount (paise) charged at checkout, e.g. the coupon-discounted first period. */
  @Expose()
  @Type(() => Number)
  upfrontAmountPaise?: number;

  @Expose()
  upfrontLabel?: string;

  @Expose()
  currency?: string;

  @Expose()
  @Type(() => RazorpaySubscriptionNotifyInfo)
  notifyInfo?: RazorpaySubscriptionNotifyInfo;
}
