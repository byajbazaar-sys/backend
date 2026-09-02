import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSubscriptionRequestModel {
  @ApiPropertyOptional({
    description: 'Internal plan id (monthly or yearly). Defaults to the active monthly plan.',
    example: 'uuid',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  planId?: string;

  @ApiPropertyOptional({
    description: 'Optional coupon code to apply at subscription creation',
    example: 'WELCOME50',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  couponCode?: string;
}
