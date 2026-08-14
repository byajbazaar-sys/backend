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

  @Expose()
  @Type(() => RazorpaySubscriptionNotifyInfo)
  notifyInfo?: RazorpaySubscriptionNotifyInfo;
}
