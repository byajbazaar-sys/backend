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
  maximumDiscount?: number;

  @Expose()
  @Type(() => Date)
  expiry?: Date;

  @Expose()
  maximumRedemption?: number;

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
