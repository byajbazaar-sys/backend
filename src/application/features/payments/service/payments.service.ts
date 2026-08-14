import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SUBSCRIPTION_PROVIDER_RAZORPAY, DEFAULT_PAGE_NUMBER, DEFAULT_PAGE_SIZE } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { RazorpayOptions } from '../../../shared';
import {
  ESubscriptionStatus,
  Subscription,
  RazorpayCreateSubscriptionData,
  SubscriptionUserProfileData,
} from '../domain';
import {
  ApplyCouponRequestModel,
  ApplyCouponResponseModel,
  CancelSubscriptionRequestModel,
  CreateSubscriptionRequestModel,
  CreateSubscriptionResponseModel,
  PaymentResponseModel,
  SubscriptionStatusResponseModel,
} from '../models';
import { COUPON_SERVICE, ICouponService } from './i-coupon.service';
import { IPaymentsRepository, PAYMENTS_REPOSITORY } from './i-payments.repository';
import { IPaymentsService } from './i-payments.service';
import { IPlansRepository, PLANS_REPOSITORY } from './i-plans.repository';
import { IRazorpayService, RAZORPAY_SERVICE } from './i-razorpay.service';
import { ISubscriptionsRepository, SUBSCRIPTIONS_REPOSITORY } from './i-subscriptions.repository';
import { IUsersRepository, USERS_REPOSITORY } from '../../users';
import { requireCheckoutPlan } from '../utils/checkout-plan.util';
import { isTrialActive, resolveTrialEndsAt, trialDaysRemaining } from '../utils/trial.util';

@Injectable()
export class PaymentsService implements IPaymentsService {
  constructor(
    private readonly razorpayOptions: RazorpayOptions,
    @Inject(RAZORPAY_SERVICE) private readonly razorpay: IRazorpayService,
    @Inject(COUPON_SERVICE) private readonly couponService: ICouponService,
    @Inject(SUBSCRIPTIONS_REPOSITORY) private readonly subscriptionsRepo: ISubscriptionsRepository,
    @Inject(PAYMENTS_REPOSITORY) private readonly paymentsRepo: IPaymentsRepository,
    @Inject(PLANS_REPOSITORY) private readonly plansRepo: IPlansRepository,
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @InjectPinoLogger(PaymentsService.name) private readonly logger: PinoLogger,
  ) {}

  async hasActiveSubscription(userId: string): Promise<boolean> {
    const active = await this.subscriptionsRepo.findActiveByUserId(userId);
    return !!active;
  }

  async hasAppAccess(userId: string): Promise<boolean> {
    if (await this.hasActiveSubscription(userId)) {
      return true;
    }
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      return false;
    }
    return isTrialActive(user, this.razorpayOptions.defaultTrialDays);
  }

  async createSubscription(
    userId: string,
    body: CreateSubscriptionRequestModel,
    userProfile: SubscriptionUserProfileData,
  ): Promise<CreateSubscriptionResponseModel> {
    const activePlan = await requireCheckoutPlan(this.plansRepo);
    const originalAmount = Number(activePlan.price);
    const currency = activePlan.currency?.trim().toUpperCase() || this.razorpayOptions.planCurrency;
    let discountAmount = 0;
    let finalAmount = originalAmount;
    let couponId: string = null;

    if (body.couponCode?.trim()) {
      const preview = await this.couponService.preview(body.couponCode, userId, originalAmount);
      discountAmount = preview.discountAmount;
      finalAmount = preview.finalAmount;
      couponId = preview.coupon.id!;
      this.assertCouponApplied(body.couponCode, discountAmount);
    }

    let blocking = await this.subscriptionsRepo.findBlockingByUserId(userId);
    if (blocking) {
      if (blocking.status === ESubscriptionStatus.Active) {
        throw new ConflictException('You already have an active subscription');
      }
      if (blocking.status === ESubscriptionStatus.Created || blocking.status === ESubscriptionStatus.Authenticated) {
        if (blocking.providerSubscriptionId) {
          if (!this.checkoutTermsMatch(blocking, couponId, discountAmount, finalAmount)) {
            await this.invalidateCheckoutSubscription(blocking);
            blocking = await this.subscriptionsRepo.findById(blocking.id);
          } else {
            const reuse = await this.tryReuseCheckoutSubscription(blocking);
            if (reuse === 'already_active') {
              throw new ConflictException('You already have an active subscription');
            }
            if (reuse) {
              this.assertCouponApplied(body.couponCode, Number(reuse.discountAmount));
              return reuse;
            }
            blocking = await this.subscriptionsRepo.findById(blocking.id);
          }
        }
      }
      if (
        blocking &&
        (blocking.status === ESubscriptionStatus.Pending || blocking.status === ESubscriptionStatus.Paused)
      ) {
        throw new ConflictException(`A subscription is already in progress (status: ${blocking.status})`);
      }
    }

    if (finalAmount <= 0) {
      throw new BadRequestException('Invalid subscription amount');
    }

    const amountPaise = Math.round(finalAmount * 100);
    const razorpayPlanId =
      finalAmount === originalAmount
        ? activePlan.providerPlanId
        : (await this.razorpay.ensureMonthlyPlan(amountPaise, currency)).id;

    const previousSub = await this.subscriptionsRepo.findLatestByUserId(userId);
    const providerCustomerId = previousSub?.providerCustomerId ?? null;

    const subscriptionNotes = body.couponCode
      ? { couponCode: body.couponCode.trim().toUpperCase(), planId: activePlan.id }
      : { planId: activePlan.id };
    const incompleteCheckout =
      blocking &&
      !blocking.providerSubscriptionId &&
      (blocking.status === ESubscriptionStatus.Created || blocking.status === ESubscriptionStatus.Authenticated)
        ? blocking
        : null;

    const local = incompleteCheckout
      ? await this.subscriptionsRepo.update(incompleteCheckout.id, {
          planId: razorpayPlanId,
          providerCustomerId,
          amount: finalAmount,
          currency,
          couponId,
          discountAmount,
          notes: subscriptionNotes,
        })
      : await this.subscriptionsRepo.insert({
          userId,
          planId: razorpayPlanId,
          provider: SUBSCRIPTION_PROVIDER_RAZORPAY,
          providerSubscriptionId: null,
          providerCustomerId,
          status: ESubscriptionStatus.Created,
          amount: finalAmount,
          currency,
          couponId,
          discountAmount,
          cancelAtPeriodEnd: false,
          notes: subscriptionNotes,
        });

    const rzpSub = await this.razorpay.createSubscription(
      plainToInstance(RazorpayCreateSubscriptionData, {
        planId: razorpayPlanId,
        notes: {
          userId,
          subscriptionId: local.id,
          couponCode: body.couponCode?.trim().toUpperCase() ?? '',
        },
        notifyInfo: {
          email: userProfile.email,
          phone: userProfile.phone,
        },
      }),
    );

    const updated = await this.subscriptionsRepo.update(local.id, {
      providerSubscriptionId: rzpSub.id,
      status: this.mapRzpStatus(rzpSub.status),
      currentStart: rzpSub.current_start ? new Date(rzpSub.current_start * 1000) : null,
      currentEnd: rzpSub.current_end ? new Date(rzpSub.current_end * 1000) : null,
      nextBillingAt: rzpSub.charge_at ? new Date(rzpSub.charge_at * 1000) : null,
    });

    return plainToInstance(
      CreateSubscriptionResponseModel,
      {
        subscriptionId: updated.id,
        razorpaySubscriptionId: updated.providerSubscriptionId,
        razorpayKeyId: this.razorpay.getKeyId(),
        planId: updated.planId,
        amount: originalAmount,
        currency: updated.currency,
        discountAmount,
        finalAmount,
        status: updated.status,
        shortUrl: rzpSub.short_url,
      },
      { excludeExtraneousValues: true },
    );
  }

  async getStatus(userId: string): Promise<SubscriptionStatusResponseModel> {
    let latest = await this.subscriptionsRepo.findLatestByUserId(userId);
    if (latest?.providerSubscriptionId) {
      latest = await this.syncSubscriptionFromRazorpay(latest);
    }
    const active = latest?.status === ESubscriptionStatus.Active;
    const user = await this.usersRepo.findById(userId);
    const defaultTrialDays = this.razorpayOptions.defaultTrialDays;
    const trialEndsAt = user ? resolveTrialEndsAt(user, defaultTrialDays) : null;
    const onTrial = user ? isTrialActive(user, defaultTrialDays) : false;
    const daysRemaining = user ? trialDaysRemaining(user, defaultTrialDays) : 0;
    const activePlan = await this.plansRepo.findActiveDefault();

    return plainToInstance(
      SubscriptionStatusResponseModel,
      {
        hasActiveSubscription: !!active,
        hasAppAccess: !!active || onTrial,
        isOnTrial: onTrial,
        trialEndsAt,
        trialDaysRemaining: daysRemaining,
        status: latest?.status ?? null,
        subscriptionId: latest?.id ?? null,
        currentStart: latest?.currentStart ?? null,
        currentEnd: latest?.currentEnd ?? null,
        nextBillingAt: latest?.nextBillingAt ?? null,
        cancelAtPeriodEnd: latest?.cancelAtPeriodEnd ?? false,
        amount: latest ? Number(latest.amount) : activePlan ? Number(activePlan.price) : null,
        currency: latest?.currency ?? activePlan?.currency ?? this.razorpayOptions.planCurrency,
      },
      { excludeExtraneousValues: true },
    );
  }

  async cancel(userId: string, body: CancelSubscriptionRequestModel): Promise<SubscriptionStatusResponseModel> {
    const sub = await this.requireOwnedActiveOrPaused(userId);
    if (!sub.providerSubscriptionId) {
      throw new BadRequestException('Subscription is not linked to Razorpay');
    }

    const cancelAtPeriodEnd = body.cancelAtPeriodEnd !== false;
    await this.razorpay.cancelSubscription(sub.providerSubscriptionId, cancelAtPeriodEnd);

    await this.subscriptionsRepo.update(sub.id, {
      cancelAtPeriodEnd,
      status: cancelAtPeriodEnd ? sub.status : ESubscriptionStatus.Cancelled,
      cancelledAt: cancelAtPeriodEnd ? null : new Date(),
    });

    return this.getStatus(userId);
  }

  async resume(userId: string): Promise<SubscriptionStatusResponseModel> {
    const latest = await this.subscriptionsRepo.findLatestByUserId(userId);
    if (latest?.userId !== userId) {
      throw new NotFoundException('Subscription not found');
    }
    if (!latest.providerSubscriptionId) {
      throw new BadRequestException('Subscription is not linked to Razorpay');
    }

    if (latest.cancelAtPeriodEnd && latest.status === ESubscriptionStatus.Active) {
      // Undo cancel-at-period-end by clearing local flag; Razorpay cancel-at-cycle-end
      // cannot always be reversed — attempt resume/pause path for halted/paused.
      await this.subscriptionsRepo.update(latest.id, { cancelAtPeriodEnd: false });
      return this.getStatus(userId);
    }

    if (latest.status === ESubscriptionStatus.Paused || latest.status === ESubscriptionStatus.Halted) {
      await this.razorpay.resumeSubscription(latest.providerSubscriptionId);
      await this.subscriptionsRepo.update(latest.id, {
        status: ESubscriptionStatus.Active,
        cancelAtPeriodEnd: false,
      });
      return this.getStatus(userId);
    }

    throw new BadRequestException('Subscription cannot be resumed in its current state');
  }

  async applyCoupon(userId: string, body: ApplyCouponRequestModel): Promise<ApplyCouponResponseModel> {
    const activePlan = await requireCheckoutPlan(this.plansRepo);
    const preview = await this.couponService.preview(body.code, userId, Number(activePlan.price));
    return this.couponService.toResponse(preview);
  }

  async listPayments(
    userId: string,
    page = DEFAULT_PAGE_NUMBER,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<PaymentResponseModel[]> {
    const { items } = await this.paymentsRepo.findByUserId(userId, page, pageSize);
    return plainToInstance(PaymentResponseModel, items, { excludeExtraneousValues: true });
  }

  private async requireOwnedActiveOrPaused(userId: string): Promise<Subscription> {
    const latest = await this.subscriptionsRepo.findLatestByUserId(userId);
    if (!latest) {
      throw new NotFoundException('Subscription not found');
    }
    if (latest.userId !== userId) {
      throw new ForbiddenException('Subscription does not belong to this user');
    }
    if (
      latest.status !== ESubscriptionStatus.Active &&
      latest.status !== ESubscriptionStatus.Paused &&
      latest.status !== ESubscriptionStatus.Authenticated
    ) {
      throw new BadRequestException(`Cannot cancel subscription in status: ${latest.status}`);
    }
    return latest;
  }

  private mapRzpStatus(status: string): ESubscriptionStatus {
    const mapped = Object.values(ESubscriptionStatus).find((s) => s === status);
    return mapped ?? ESubscriptionStatus.Created;
  }

  private assertCouponApplied(couponCode: string, discountAmount: number): void {
    if (!couponCode?.trim()) {
      return;
    }
    if (discountAmount <= 0) {
      throw new BadRequestException('You have already redeemed this coupon');
    }
  }

  private checkoutTermsMatch(
    subscription: Subscription,
    couponId: string,
    discountAmount: number,
    finalAmount: number,
  ): boolean {
    return (
      (subscription.couponId ?? null) === couponId &&
      Number(subscription.discountAmount ?? 0) === discountAmount &&
      Number(subscription.amount) === finalAmount
    );
  }

  private async invalidateCheckoutSubscription(subscription: Subscription): Promise<void> {
    if (!subscription.providerSubscriptionId) {
      return;
    }

    try {
      await this.razorpay.cancelSubscription(subscription.providerSubscriptionId, false);
    } catch (err) {
      this.logger.warn(
        { err, providerSubscriptionId: subscription.providerSubscriptionId },
        'Failed to cancel stale Razorpay checkout subscription',
      );
    }

    await this.subscriptionsRepo.update(subscription.id, {
      providerSubscriptionId: null,
    });
  }

  private toCreateSubscriptionResponse(subscription: Subscription, shortUrl?: string): CreateSubscriptionResponseModel {
    return plainToInstance(
      CreateSubscriptionResponseModel,
      {
        subscriptionId: subscription.id,
        razorpaySubscriptionId: subscription.providerSubscriptionId,
        razorpayKeyId: this.razorpay.getKeyId(),
        planId: subscription.planId,
        amount: Number(subscription.amount) + Number(subscription.discountAmount ?? 0),
        currency: subscription.currency,
        discountAmount: Number(subscription.discountAmount ?? 0),
        finalAmount: Number(subscription.amount),
        status: subscription.status,
        shortUrl: shortUrl ?? null,
      },
      { excludeExtraneousValues: true },
    );
  }

  private async syncSubscriptionFromRazorpay(subscription: Subscription): Promise<Subscription> {
    if (!subscription.providerSubscriptionId) {
      return subscription;
    }

    try {
      const rzp = await this.razorpay.fetchSubscription(subscription.providerSubscriptionId);
      return this.subscriptionsRepo.update(subscription.id, {
        status: this.mapRzpStatus(rzp.status),
        currentStart: rzp.current_start ? new Date(rzp.current_start * 1000) : null,
        currentEnd: rzp.current_end ? new Date(rzp.current_end * 1000) : null,
        nextBillingAt: rzp.charge_at ? new Date(rzp.charge_at * 1000) : null,
      });
    } catch (err) {
      this.logger.warn(
        { err, providerSubscriptionId: subscription.providerSubscriptionId },
        'Razorpay subscription sync failed',
      );
      return subscription;
    }
  }

  private async tryReuseCheckoutSubscription(
    subscription: Subscription,
  ): Promise<CreateSubscriptionResponseModel | 'already_active'> {
    if (!subscription.providerSubscriptionId) {
      return null;
    }

    try {
      const rzp = await this.razorpay.fetchSubscription(subscription.providerSubscriptionId);
      const mappedStatus = this.mapRzpStatus(rzp.status);
      const updated = await this.subscriptionsRepo.update(subscription.id, {
        status: mappedStatus,
        currentStart: rzp.current_start ? new Date(rzp.current_start * 1000) : null,
        currentEnd: rzp.current_end ? new Date(rzp.current_end * 1000) : null,
        nextBillingAt: rzp.charge_at ? new Date(rzp.charge_at * 1000) : null,
      });

      if (mappedStatus === ESubscriptionStatus.Active) {
        return 'already_active';
      }

      if (mappedStatus === ESubscriptionStatus.Created || mappedStatus === ESubscriptionStatus.Authenticated) {
        return this.toCreateSubscriptionResponse(updated, rzp.short_url);
      }

      await this.subscriptionsRepo.update(subscription.id, {
        providerSubscriptionId: null,
      });
      return null;
    } catch (err) {
      this.logger.warn(
        { err, providerSubscriptionId: subscription.providerSubscriptionId },
        'Stale Razorpay subscription — creating a fresh checkout session',
      );
      await this.subscriptionsRepo.update(subscription.id, {
        providerSubscriptionId: null,
      });
      return null;
    }
  }
}
