import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { ESubscriptionStatus } from '../domain';

export class SubscriptionStatusResponseModel {
  @Expose()
  @ApiProperty({ description: 'Whether the user has an active subscription' })
  hasActiveSubscription: boolean;

  @Expose()
  @ApiProperty({ description: 'Whether the user can access premium features (subscription or trial)' })
  hasAppAccess: boolean;

  @Expose()
  @ApiProperty({ description: 'Whether the user is currently on trial' })
  isOnTrial: boolean;

  @Expose()
  @ApiPropertyOptional({ type: Date, nullable: true })
  @Type(() => Date)
  trialEndsAt?: Date;

  @Expose()
  @ApiPropertyOptional({ description: 'Days remaining in trial', nullable: true })
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
