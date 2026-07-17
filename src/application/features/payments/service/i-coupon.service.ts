import { ApplyCouponResponseModel } from '../models';
import { Coupon, Subscription } from '../domain';

export const COUPON_SERVICE = 'COUPON_SERVICE';

export interface CouponPreview {
  coupon: Coupon;
  discountAmount: number;
  originalAmount: number;
  finalAmount: number;
  currency: string;
}

export interface ICouponService {
  preview(code: string, userId: string, originalAmount?: number): Promise<CouponPreview>;
  toResponse(preview: CouponPreview): ApplyCouponResponseModel;
  calculateDiscount(coupon: Coupon, originalAmount: number): number;
  recordRedemptionForSubscription(subscription: Subscription): Promise<void>;
}
