import { Coupon, Subscription } from '../domain';
import { ApplyCouponResponseModel } from '../models';
import { CouponPreview } from './coupon-preview';

export const COUPON_SERVICE = 'COUPON_SERVICE';

export interface ICouponService {
  preview(code: string, userId: string, originalAmount?: number): Promise<CouponPreview>;
  toResponse(preview: CouponPreview): ApplyCouponResponseModel;
  calculateDiscount(coupon: Coupon, originalAmount: number): number;
  recordRedemptionForSubscription(subscription: Subscription): Promise<void>;
}
