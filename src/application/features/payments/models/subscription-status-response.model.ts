import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { ESubscriptionStatus } from '../domain';

export class SubscriptionStatusResponseModel {
  @Expose()
  @ApiProperty({ description: 'Whether the user has an active subscription' })
  hasActiveSubscription: boolean;

  @Expose()
  @ApiProperty({ description: 'Whether the user can access app features (always true for logged-in users)' })
  hasAppAccess: boolean;

  @Expose()
  @ApiProperty({ description: 'Whether ads should be shown (false during welcome period or active subscription)' })
  showAds: boolean;

  @Expose()
  @ApiProperty({ description: 'Whether the user is in the no-ads welcome period (first 7 days)' })
  isOnTrial: boolean;

  @Expose()
  @ApiPropertyOptional({ type: Date, nullable: true, description: 'When the no-ads welcome period ends' })
  @Type(() => Date)
  trialEndsAt?: Date;

  @Expose()
  @ApiPropertyOptional({ description: 'Days remaining in the no-ads welcome period', nullable: true })
  trialDaysRemaining?: number;

  @Expose()
  @ApiPropertyOptional({ enum: ESubscriptionStatus, nullable: true })
  status?: ESubscriptionStatus;

  @Expose()
  @ApiPropertyOptional({ description: 'Internal subscription ID', nullable: true })
  subscriptionId?: string;

  @Expose()
  @ApiPropertyOptional({ type: Date, nullable: true })
  @Type(() => Date)
  currentStart?: Date;

  @Expose()
  @ApiPropertyOptional({ type: Date, nullable: true })
  @Type(() => Date)
  currentEnd?: Date;

  @Expose()
  @ApiPropertyOptional({ type: Date, nullable: true })
  @Type(() => Date)
  nextBillingAt?: Date;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  cancelAtPeriodEnd?: boolean;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  amount?: number;

  @Expose()
  @ApiPropertyOptional({ example: 'INR', nullable: true })
  currency?: string;
}
