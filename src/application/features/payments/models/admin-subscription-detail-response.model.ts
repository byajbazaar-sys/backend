import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { AdminSubscriptionListItemModel } from './admin-subscription-list-item.model';
import { PaymentResponseModel } from './payment-response.model';
import { RefundResponseModel } from './refund-response.model';
import { WebhookEventSummaryModel } from './webhook-event-summary.model';

export class AdminSubscriptionDetailResponseModel extends AdminSubscriptionListItemModel {
  @Expose()
  @ApiPropertyOptional()
  amount?: number;

  @Expose()
  @ApiPropertyOptional()
  currency?: string;

  @Expose()
  @ApiPropertyOptional()
  discountAmount?: number;

  @Expose()
  @ApiPropertyOptional()
  couponCode?: string;

  @Expose()
  @ApiPropertyOptional()
  cancelAtPeriodEnd?: boolean;

  @Expose()
  @ApiPropertyOptional()
  cancelledAt?: Date;

  @Expose()
  @ApiPropertyOptional()
  providerPlanId?: string;

  @Expose()
  @ApiPropertyOptional()
  userId?: string;

  @Expose()
  @ApiPropertyOptional()
  isOnTrial?: boolean;

  @Expose()
  @ApiPropertyOptional()
  trialEndsAt?: Date;

  @Expose()
  @ApiPropertyOptional()
  trialDaysRemaining?: number;

  @Expose()
  @ApiProperty({ type: [PaymentResponseModel] })
  payments!: PaymentResponseModel[];

  @Expose()
  @ApiProperty({ type: [RefundResponseModel] })
  refunds!: RefundResponseModel[];

  @Expose()
  @ApiProperty({ type: [WebhookEventSummaryModel] })
  webhookEvents!: WebhookEventSummaryModel[];

  @Expose()
  @ApiPropertyOptional()
  rawRazorpayJson?: Record<string, unknown>;
}
