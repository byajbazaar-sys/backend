import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { DEFAULT_PAGE_NUMBER, DEFAULT_PAGE_SIZE } from '@shared-libs';
import { ESubscriptionStatus, RazorpayCreateRefundData } from '../domain';
import {
  AdminSubscriptionDetailResponseModel,
  AdminSubscriptionListItemModel,
  AdminSubscriptionsPagedResponseModel,
  CreateRefundRequestModel,
  ExtendTrialRequestModel,
  ListAdminSubscriptionsQueryModel,
  PaymentResponseModel,
  RefundResponseModel,
  WebhookEventSummaryModel,
} from '../models';
import { ISubscriptionAdminService } from './i-subscription-admin.service';
import {
  ISubscriptionsRepository,
  SUBSCRIPTIONS_REPOSITORY,
} from './i-subscriptions.repository';
import { IPlansRepository, PLANS_REPOSITORY } from './i-plans.repository';
import { IPaymentsRepository, PAYMENTS_REPOSITORY } from './i-payments.repository';
import {
  IPaymentEventsRepository,
  PAYMENT_EVENTS_REPOSITORY,
} from './i-payment-events.repository';
import { ICouponsRepository, COUPONS_REPOSITORY } from './i-coupons.repository';
import { IRazorpayService, RAZORPAY_SERVICE } from './i-razorpay.service';
import { IUsersRepository, USERS_REPOSITORY } from '../../users';
import { IRefundsRepository, REFUNDS_REPOSITORY } from './i-refunds.repository';
import { REFUND_SERVICE, RefundService } from './refund.service';
import { RazorpayOptions } from '../../../shared';
import {
  isTrialActive,
  resolveTrialEndsAt,
  trialDaysRemaining,
} from '../utils/trial.util';
import { isPaymentRefundable, remainingRefundableAmount } from '../utils/refund.util';

@Injectable()
export class SubscriptionAdminService implements ISubscriptionAdminService {
  constructor(
    @Inject(SUBSCRIPTIONS_REPOSITORY) private readonly subscriptionsRepo: ISubscriptionsRepository,
    @Inject(PLANS_REPOSITORY) private readonly plansRepo: IPlansRepository,
    @Inject(PAYMENTS_REPOSITORY) private readonly paymentsRepo: IPaymentsRepository,
    @Inject(PAYMENT_EVENTS_REPOSITORY) private readonly paymentEventsRepo: IPaymentEventsRepository,
    @Inject(COUPONS_REPOSITORY) private readonly couponsRepo: ICouponsRepository,
    @Inject(RAZORPAY_SERVICE) private readonly razorpay: IRazorpayService,
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(REFUNDS_REPOSITORY) private readonly refundsRepo: IRefundsRepository,
    @Inject(REFUND_SERVICE) private readonly refundService: RefundService,
    private readonly razorpayOptions: RazorpayOptions,
  ) {}

  async list(query: ListAdminSubscriptionsQueryModel): Promise<AdminSubscriptionsPagedResponseModel> {
    const page = query.pageNumber ?? DEFAULT_PAGE_NUMBER;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { items, totalCount } = await this.subscriptionsRepo.findAllAdmin({
      page,
      pageSize,
      status: query.status,
      search: query.search,
    });

    const mapped = await Promise.all(
      items.map(async (row) => this.toListItem(row)),
    );

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    return plainToInstance(
      AdminSubscriptionsPagedResponseModel,
      {
        items: mapped,
        page,
        perPage: pageSize,
        totalCount,
        totalPages,
      },
      { excludeExtraneousValues: true },
    );
  }

  async getById(id: string): Promise<AdminSubscriptionDetailResponseModel> {
    const sub = await this.requireSubscription(id);
    const userRow = await this.loadUserRow(sub.userId);
    return this.toDetail(sub, null, userRow);
  }

  async cancel(id: string): Promise<AdminSubscriptionDetailResponseModel> {
    const sub = await this.requireSubscription(id);
    if (!sub.providerSubscriptionId) {
      throw new BadRequestException('Subscription is not linked to Razorpay');
    }
    await this.razorpay.cancelSubscription(sub.providerSubscriptionId, false);
    const updated = await this.subscriptionsRepo.update(sub.id!, {
      cancelAtPeriodEnd: false,
    });
    const userRow = await this.loadUserRow(updated.userId);
    return this.toDetail(updated, null, userRow);
  }

  async resume(id: string): Promise<AdminSubscriptionDetailResponseModel> {
    const sub = await this.requireSubscription(id);
    if (!sub.providerSubscriptionId) {
      throw new BadRequestException('Subscription is not linked to Razorpay');
    }

    if (sub.cancelAtPeriodEnd && sub.status === ESubscriptionStatus.Active) {
      const updated = await this.subscriptionsRepo.update(sub.id!, { cancelAtPeriodEnd: false });
      const userRow = await this.loadUserRow(updated.userId);
      return this.toDetail(updated, null, userRow);
    }

    if (sub.status === ESubscriptionStatus.Paused || sub.status === ESubscriptionStatus.Halted) {
      await this.razorpay.resumeSubscription(sub.providerSubscriptionId);
      const updated = await this.subscriptionsRepo.update(sub.id!, {
        status: ESubscriptionStatus.Active,
        cancelAtPeriodEnd: false,
      });
      const userRow = await this.loadUserRow(updated.userId);
      return this.toDetail(updated, null, userRow);
    }

    throw new BadRequestException('Subscription cannot be resumed in its current state');
  }

  async sync(id: string): Promise<AdminSubscriptionDetailResponseModel> {
    const sub = await this.requireSubscription(id);
    if (!sub.providerSubscriptionId) {
      throw new BadRequestException('Subscription is not linked to Razorpay');
    }

    const remote = await this.razorpay.fetchSubscription(sub.providerSubscriptionId);
    const updated = await this.subscriptionsRepo.update(sub.id!, {
      status: this.mapRzpStatus(remote.status),
      currentStart: remote.current_start ? new Date(remote.current_start * 1000) : null,
      currentEnd: remote.current_end ? new Date(remote.current_end * 1000) : null,
      nextBillingAt: remote.charge_at ? new Date(remote.charge_at * 1000) : null,
    });

    const userRow = await this.loadUserRow(updated.userId);
    return this.toDetail(updated, remote.raw, userRow);
  }

  async refundPayment(
    paymentId: string,
    body: CreateRefundRequestModel,
  ): Promise<RefundResponseModel> {
    const payment = await this.paymentsRepo.findById(paymentId);
    if (!payment?.id) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.status === 'refunded') {
      throw new BadRequestException('Payment has already been fully refunded');
    }
    if (!isPaymentRefundable(payment.status)) {
      throw new BadRequestException('Only captured or partially refunded payments can be refunded');
    }

    const existingRefunds = await this.refundsRepo.findByPaymentId(payment.id);
    const remaining = remainingRefundableAmount(Number(payment.amount), existingRefunds);

    if (remaining <= 0) {
      throw new BadRequestException('Payment has already been fully refunded');
    }

    const refundAmountInr = body.amount ?? remaining;
    if (refundAmountInr <= 0 || refundAmountInr > remaining + 0.01) {
      throw new BadRequestException(
        `Refund amount must be between 0.01 and ${remaining} ${payment.currency ?? 'INR'}`,
      );
    }

    const amountPaise = Math.round(refundAmountInr * 100);
    const rzpRefund = await this.razorpay.createRefund(
      plainToInstance(RazorpayCreateRefundData, {
        providerPaymentId: payment.providerPaymentId,
        amountPaise,
        notes: body.reason ? { reason: body.reason } : undefined,
      }),
    );

    const saved = await this.refundService.recordRefund(payment, {
      paymentId: payment.id,
      providerRefundId: rzpRefund.id,
      amount: refundAmountInr,
      status: rzpRefund.status,
      reason: body.reason ?? null,
      rawJson: rzpRefund.raw,
    });

    return plainToInstance(RefundResponseModel, saved, { excludeExtraneousValues: true });
  }

  async extendTrial(
    id: string,
    body: ExtendTrialRequestModel,
  ): Promise<AdminSubscriptionDetailResponseModel> {
    if (!body.days && !body.trialEndsAt) {
      throw new BadRequestException('Provide days or trialEndsAt');
    }

    const sub = await this.requireSubscription(id);
    const user = await this.usersRepo.findById(sub.userId);
    if (!user?.id) {
      throw new NotFoundException('User not found');
    }

    let newTrialEndsAt: Date;
    if (body.trialEndsAt) {
      newTrialEndsAt = new Date(body.trialEndsAt);
    } else {
      const currentEnds = resolveTrialEndsAt(user, this.razorpayOptions.defaultTrialDays);
      const now = new Date();
      const base = currentEnds && currentEnds > now ? currentEnds : now;
      newTrialEndsAt = new Date(base.getTime() + body.days! * 24 * 60 * 60 * 1000);
    }

    if (Number.isNaN(newTrialEndsAt.getTime())) {
      throw new BadRequestException('Invalid trialEndsAt');
    }

    await this.usersRepo.update(user.id, { trialEndsAt: newTrialEndsAt });
    const userRow = await this.loadUserRow(sub.userId);
    return this.toDetail(sub, null, userRow);
  }

  private async loadUserRow(userId: string) {
    const user = await this.usersRepo.findById(userId);
    if (!user?.email) return null;
    return {
      userId: user.id!,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      trialEndsAt: user.trialEndsAt ?? null,
      createdAt: user.createdAt ?? null,
    };
  }

  private async requireSubscription(id: string) {
    const sub = await this.subscriptionsRepo.findById(id);
    if (!sub) {
      throw new NotFoundException('Subscription not found');
    }
    return sub;
  }

  private async toListItem(row: {
    subscription: import('../domain').Subscription;
    userEmail: string;
    userFirstName: string;
    userLastName: string;
    planName: string;
  }): Promise<AdminSubscriptionListItemModel> {
    const plan = await this.plansRepo.findByProviderPlanId(row.subscription.planId);
    const userName = [row.userFirstName, row.userLastName].filter(Boolean).join(' ') || row.userEmail;
    return plainToInstance(
      AdminSubscriptionListItemModel,
      {
        id: row.subscription.id,
        userName,
        email: row.userEmail,
        planName: plan?.name ?? row.planName,
        status: row.subscription.status,
        currentStart: row.subscription.currentStart ?? null,
        currentEnd: row.subscription.currentEnd ?? null,
        nextBillingAt: row.subscription.nextBillingAt ?? null,
        providerSubscriptionId: row.subscription.providerSubscriptionId ?? null,
        createdAt: row.subscription.createdAt,
      },
      { excludeExtraneousValues: true },
    );
  }

  private async toDetail(
    sub: import('../domain').Subscription,
    rawRazorpayJson: Record<string, unknown>,
    userRow: {
      userId: string;
      email: string;
      firstName: string;
      lastName: string;
      trialEndsAt: Date;
      createdAt: Date;
    },
  ): Promise<AdminSubscriptionDetailResponseModel> {
    const plan = await this.plansRepo.findByProviderPlanId(sub.planId);
    let couponCode: string = null;
    if (sub.couponId) {
      const coupon = await this.couponsRepo.findById(sub.couponId);
      couponCode = coupon?.code ?? null;
    }

    const payments = sub.id
      ? await this.paymentsRepo.findBySubscriptionId(sub.id)
      : [];

    const paymentIds = payments.map((p) => p.id).filter((id): id is string => !!id);
    const refunds = paymentIds.length
      ? await this.refundsRepo.findByPaymentIds(paymentIds)
      : [];

    const webhookEvents = sub.providerSubscriptionId
      ? await this.paymentEventsRepo.findByProviderSubscriptionId(sub.providerSubscriptionId)
      : [];

    let remoteJson = rawRazorpayJson;
    if (!remoteJson && sub.providerSubscriptionId) {
      try {
        const remote = await this.razorpay.fetchSubscription(sub.providerSubscriptionId);
        remoteJson = remote.raw;
      } catch {
        remoteJson = null;
      }
    }

    const email = userRow?.email ?? '';
    const userName =
      [userRow?.firstName, userRow?.lastName].filter(Boolean).join(' ') || email;
    const trialUser = userRow
      ? {
          trialEndsAt: userRow.trialEndsAt,
          createdAt: userRow.createdAt,
        }
      : null;
    const defaultTrialDays = this.razorpayOptions.defaultTrialDays;
    const resolvedTrialEndsAt = trialUser
      ? resolveTrialEndsAt(trialUser, defaultTrialDays)
      : null;
    const onTrial = trialUser ? isTrialActive(trialUser, defaultTrialDays) : false;
    const daysRemaining = trialUser ? trialDaysRemaining(trialUser, defaultTrialDays) : 0;

    return plainToInstance(
      AdminSubscriptionDetailResponseModel,
      {
        id: sub.id,
        userName,
        email,
        userId: userRow?.userId,
        planName: plan?.name ?? null,
        status: sub.status,
        currentStart: sub.currentStart ?? null,
        currentEnd: sub.currentEnd ?? null,
        nextBillingAt: sub.nextBillingAt ?? null,
        providerSubscriptionId: sub.providerSubscriptionId ?? null,
        createdAt: sub.createdAt,
        amount: Number(sub.amount),
        currency: sub.currency,
        discountAmount: Number(sub.discountAmount ?? 0),
        couponCode,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
        cancelledAt: sub.cancelledAt ?? null,
        providerPlanId: sub.planId,
        isOnTrial: onTrial,
        trialEndsAt: resolvedTrialEndsAt,
        trialDaysRemaining: daysRemaining,
        payments: plainToInstance(PaymentResponseModel, payments, { excludeExtraneousValues: true }),
        refunds: plainToInstance(RefundResponseModel, refunds, { excludeExtraneousValues: true }),
        webhookEvents: plainToInstance(
          WebhookEventSummaryModel,
          webhookEvents.map((e) => ({
            id: e.id,
            eventName: e.eventName,
            processed: e.processed,
            createdAt: e.createdAt,
            userId: e.userId ?? null,
            paymentId: e.paymentId ?? null,
            paymentOrderId: e.paymentOrderId ?? null,
          })),
          { excludeExtraneousValues: true },
        ),
        rawRazorpayJson: remoteJson,
      },
      { excludeExtraneousValues: true },
    );
  }

  private mapRzpStatus(status: string): ESubscriptionStatus {
    const mapped = Object.values(ESubscriptionStatus).find((s) => s === status);
    return mapped ?? ESubscriptionStatus.Created;
  }
}
