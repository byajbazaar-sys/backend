import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { CouponPlanPreviewModel } from './coupon-plan-preview.model';
import { ECouponType } from '../domain';

export class CouponResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() code: string;
  @Expose() @ApiProperty({ enum: ECouponType }) type: ECouponType;
  @Expose() @ApiProperty() value: number;
  @Expose() @ApiProperty() minimumAmount: number;
  @Expose() @ApiPropertyOptional({ nullable: true }) maximumDiscount?: number;
  @Expose() @ApiPropertyOptional({ nullable: true }) @Type(() => Date) expiry?: Date;
  @Expose() @ApiPropertyOptional({ nullable: true }) maximumRedemption?: number;
  @Expose() @ApiProperty() usedCount: number;
  @Expose() @ApiProperty() active: boolean;
  @Expose() @ApiProperty() oncePerUser: boolean;
  @Expose() @ApiProperty() @Type(() => Date) createdAt: Date;

  @Expose()
  @ApiProperty({ type: [CouponPlanPreviewModel], description: 'What Razorpay charges first with this coupon' })
  @Type(() => CouponPlanPreviewModel)
  planPreview: CouponPlanPreviewModel[];
}
