import { Inject, Injectable } from '@nestjs/common';

import { ESubscriptionStatus, Payment, Refund } from '../domain';
import { IPaymentsRepository, PAYMENTS_REPOSITORY } from './i-payments.repository';
import { IRefundsRepository, REFUNDS_REPOSITORY } from './i-refunds.repository';
import { ISubscriptionsRepository, SUBSCRIPTIONS_REPOSITORY } from './i-subscriptions.repository';
import { isFullyRefunded, parseRefundReason, resolvePaymentStatusAfterRefund } from '../utils/refund.util';

export const REFUND_SERVICE = 'REFUND_SERVICE';

@Injectable()
export class RefundService {
  constructor(
    @Inject(REFUNDS_REPOSITORY) private readonly refundsRepo: IRefundsRepository,
    @Inject(PAYMENTS_REPOSITORY) private readonly paymentsRepo: IPaymentsRepository,
    @Inject(SUBSCRIPTIONS_REPOSITORY) private readonly subscriptionsRepo: ISubscriptionsRepository,
  ) {}

  async recordRefund(payment: Payment, refund: Refund): Promise<Refund> {
    const saved = await this.refundsRepo.upsertByProviderRefundId(refund);
    await this.syncPaymentAfterRefund(payment);
    return saved;
  }

  async syncPaymentAfterRefund(payment: Payment): Promise<void> {
    if (!payment.id) return;

    const refunds = await this.refundsRepo.findByPaymentId(payment.id);
    const nextStatus = resolvePaymentStatusAfterRefund(Number(payment.amount), refunds, payment.status);

    if (nextStatus !== payment.status) {
      await this.paymentsRepo.upsertByProviderPaymentId({
        ...payment,
        status: nextStatus,
      });
    }

    if (isFullyRefunded(Number(payment.amount), refunds) && payment.subscriptionId) {
      const sub = await this.subscriptionsRepo.findById(payment.subscriptionId);
      if (sub?.status === ESubscriptionStatus.Active) {
        await this.subscriptionsRepo.update(payment.subscriptionId, {
          status: ESubscriptionStatus.Cancelled,
          cancelledAt: new Date(),
          cancelAtPeriodEnd: false,
        });
      }
    }
  }

  buildRefundFromWebhook(payment: Payment, entity: Record<string, unknown>): Refund {
    const status = String(entity.status ?? '');
    const notesReason = parseRefundReason(entity.notes);
    const failureReason = status === 'failed' && entity.error_description ? String(entity.error_description) : null;

    return {
      paymentId: payment.id,
      providerRefundId: String(entity.id),
      amount: Number(entity.amount ?? 0) / 100,
      status,
      reason: failureReason ?? notesReason,
      rawJson: entity,
    };
  }
}
