import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApplyCouponRequestModel {
  @ApiProperty({
    description: 'Coupon code to apply',
    example: 'WELCOME50',
    maxLength: 64,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

  @ApiPropertyOptional({
    description: 'Internal plan id to price the coupon against (defaults to active monthly plan)',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  planId?: string;
}
