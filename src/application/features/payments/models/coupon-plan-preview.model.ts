import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class CouponPlanPreviewModel {
  @Expose()
  @ApiProperty({ example: 'Monthly' })
  planName: string;

  @Expose()
  @ApiProperty({ example: 'monthly' })
  interval: string;

  @Expose()
  @ApiProperty({ example: 499 })
  price: number;

  @Expose()
  @ApiProperty({ example: 299, description: 'First payment charged in Razorpay with this coupon' })
  firstPayment: number;

  @Expose()
  @ApiProperty({ description: 'False when the plan is below the coupon minimum' })
  applies: boolean;
}
