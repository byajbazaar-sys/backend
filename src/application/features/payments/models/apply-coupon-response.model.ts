import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { ECouponType } from '../domain';

export class ApplyCouponResponseModel {
  @Expose()
  @ApiProperty({ example: 'WELCOME50' })
  code: string;

  @Expose()
  @ApiProperty({ enum: ECouponType })
  type: ECouponType;

  @Expose()
  @ApiProperty({ description: 'Coupon value (flat amount or percentage)' })
  value: number;

  @Expose()
  @ApiProperty({ description: 'Computed discount amount' })
  discountAmount: number;

  @Expose()
  @ApiProperty({ description: 'Original amount before discount' })
  originalAmount: number;

  @Expose()
  @ApiProperty({ description: 'Final amount after discount' })
  finalAmount: number;

  @Expose()
  @ApiProperty({ example: 'INR' })
  currency: string;
}
