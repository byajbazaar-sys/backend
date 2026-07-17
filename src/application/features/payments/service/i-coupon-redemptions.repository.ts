import { CouponRedemption } from '../domain';

export const COUPON_REDEMPTIONS_REPOSITORY = 'COUPON_REDEMPTIONS_REPOSITORY';

export interface ICouponRedemptionsRepository {
  insert(data: CouponRedemption): Promise<CouponRedemption>;
  findByCouponAndUser(couponId: string, userId: string): Promise<CouponRedemption | null>;
  findBySubscriptionId(subscriptionId: string): Promise<CouponRedemption | null>;
  deleteById(id: string): Promise<void>;
}
