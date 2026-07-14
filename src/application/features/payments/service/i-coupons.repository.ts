import { Coupon } from '../domain';

export const COUPONS_REPOSITORY = 'COUPONS_REPOSITORY';

export interface ICouponsRepository {
  findByCode(code: string): Promise<Coupon | null>;
  findById(id: string): Promise<Coupon | null>;
  incrementUsedCount(id: string): Promise<Coupon>;
}
