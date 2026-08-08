import { Coupon } from '../domain';

export interface CouponPreview {
  coupon: Coupon;
  discountAmount: number;
  originalAmount: number;
  finalAmount: number;
  currency: string;
}
