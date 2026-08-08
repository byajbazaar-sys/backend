import { Expose } from 'class-transformer';

export class RazorpaySubscriptionNotifyInfo {
  @Expose()
  email?: string;

  @Expose()
  phone?: string;
}
