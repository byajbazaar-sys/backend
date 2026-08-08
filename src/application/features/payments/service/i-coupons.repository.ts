import { Coupon } from '../domain';

export const COUPONS_REPOSITORY = 'COUPONS_REPOSITORY';

export interface ICouponsRepository {
  findByCode(code: string): Promise<Coupon>;
  findById(id: string): Promise<Coupon>;
  incrementUsedCount(id: string): Promise<Coupon>;
}
