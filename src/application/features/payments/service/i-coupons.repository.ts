import { Coupon } from '../domain';

export const COUPONS_REPOSITORY = 'COUPONS_REPOSITORY';

export interface ICouponsRepository {
  findByCode(code: string): Promise<Coupon>;
  findById(id: string): Promise<Coupon>;
  incrementUsedCount(id: string): Promise<Coupon>;
  findAll(): Promise<Coupon[]>;
  insert(data: Partial<Coupon>): Promise<Coupon>;
  update(id: string, data: Partial<Coupon>): Promise<Coupon>;
  delete(id: string): Promise<void>;
}
