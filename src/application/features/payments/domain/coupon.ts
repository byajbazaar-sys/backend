import { Expose, Type } from 'class-transformer';
import { ECouponType } from './enums';

export class Coupon {
  @Expose()
  id?: string;

  @Expose()
  code: string;

  @Expose()
  type: ECouponType;

  @Expose()
  value: number;

  @Expose()
  minimumAmount: number;

  @Expose()
  maximumDiscount?: number | null;

  @Expose()
  @Type(() => Date)
  expiry?: Date | null;

  @Expose()
  maximumRedemption?: number | null;

  @Expose()
  usedCount: number;

  @Expose()
  active: boolean;

  @Expose()
  oncePerUser: boolean;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;

  @Expose()
  @Type(() => Date)
  updatedAt?: Date;
}
