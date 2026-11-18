import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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

import { ECouponType } from '../domain';
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
