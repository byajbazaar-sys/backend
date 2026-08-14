import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { ESubscriptionStatus } from '../domain';

export class CreateSubscriptionResponseModel {
  @Expose()
  @ApiProperty({ description: 'Internal subscription ID' })
  subscriptionId: string;

  @Expose()
  @ApiProperty({ description: 'Razorpay subscription ID' })
  razorpaySubscriptionId: string;

  @Expose()
  @ApiProperty({ description: 'Razorpay public key ID for checkout' })
  razorpayKeyId: string;

  @Expose()
  @ApiProperty({ description: 'Plan ID' })
  planId: string;

  @Expose()
  @ApiProperty({ description: 'Original amount before discount' })
  amount: number;

  @Expose()
  @ApiProperty({ description: 'Currency code', example: 'INR' })
  currency: string;

  @Expose()
  @ApiProperty({ description: 'Discount amount applied' })
  discountAmount: number;

  @Expose()
  @ApiProperty({ description: 'Final payable amount after discount' })
  finalAmount: number;

  @Expose()
  @ApiProperty({ enum: ESubscriptionStatus })
  status: ESubscriptionStatus;

  @Expose()
  @ApiPropertyOptional({ description: 'Razorpay short URL for payment', nullable: true })
  shortUrl?: string;
}
