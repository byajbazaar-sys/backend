import { Expose } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminSubscriptionListItemModel } from './admin-subscription-response.model';
import { PaymentResponseModel } from './payment-response.model';
import { RefundResponseModel } from './refund-response.model';

export class WebhookEventSummaryModel {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  eventName!: string;

  @Expose()
  @ApiProperty()
  processed!: boolean;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  userId?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  paymentId?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  paymentOrderId?: string;
}

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
