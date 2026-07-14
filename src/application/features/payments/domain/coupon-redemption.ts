import { Expose, Type } from 'class-transformer';

export class CouponRedemption {
  @Expose()
  id?: string;

  @Expose()
  couponId: string;

  @Expose()
  userId: string;

  @Expose()
  subscriptionId?: string | null;

  @Expose()
  discountAmount: number;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;
}
