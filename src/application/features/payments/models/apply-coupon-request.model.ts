import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
}
