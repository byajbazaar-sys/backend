import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { ESubscriptionStatus } from '../domain';

export class SubscriptionStatusResponseModel {
  @Expose()
  @ApiProperty({ description: 'Whether the user has an active subscription' })
  hasActiveSubscription: boolean;

  @Expose()
  @ApiProperty({ description: 'Whether the user can use the app (trial running or a paid plan)' })
  hasAppAccess: boolean;

  @Expose()
  @ApiProperty({ description: 'Deprecated: ads were removed. Always false.' })
  showAds: boolean;

  @Expose()
  @ApiProperty({ description: 'Whether the user is in the 7-day trial (and has no paid plan)' })
  isOnTrial: boolean;

  @Expose()
  @ApiProperty({ description: 'Length of the trial in days', example: 7 })
  trialDays: number;

  @Expose()
  @ApiPropertyOptional({ type: Date, nullable: true, description: 'When the trial ends' })
  @Type(() => Date)
  trialEndsAt?: Date;

  @Expose()
  @ApiPropertyOptional({ description: 'Days remaining in the trial', nullable: true })
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
