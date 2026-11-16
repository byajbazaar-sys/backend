import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ECouponType } from '../domain/enums';

export class CreateCouponRequestModel {
  @ApiProperty({ example: 'DIWALI200', description: 'Letters, numbers, - and _ (stored in capitals)' })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Coupon code can only contain letters, numbers, - and _' })
  code: string;

  @ApiProperty({ enum: ECouponType })
  @IsEnum(ECouponType)
  type: ECouponType;

  @ApiProperty({ example: 200, description: '₹ off for flat, % off for percentage' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @ValidateIf((o: CreateCouponRequestModel) => o.type === ECouponType.Percentage)
  @Max(99)
  value: number;

  @ApiPropertyOptional({ example: 0, description: 'Plan price must be at least this (₹)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumAmount?: number;

  @ApiPropertyOptional({ example: 500, description: 'Cap on the discount for percentage coupons (₹)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maximumDiscount?: number;

  @ApiPropertyOptional({ description: 'ISO date-time after which the coupon stops working' })
  @IsOptional()
  @IsDateString()
  expiry?: string;

  @ApiPropertyOptional({ example: 100, description: 'Total redemptions allowed (empty = unlimited)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maximumRedemption?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  oncePerUser?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Type and value can only change while the coupon is unused. */
export class UpdateCouponRequestModel {
  @ApiPropertyOptional({ enum: ECouponType })
  @IsOptional()
  @IsEnum(ECouponType)
  type?: ECouponType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  value?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumAmount?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maximumDiscount?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  expiry?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maximumRedemption?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  oncePerUser?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

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
