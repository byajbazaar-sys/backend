import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SUBSCRIPTION_PROVIDER_RAZORPAY,
  DEFAULT_PAGE_NUMBER,
  DEFAULT_PAGE_SIZE,
  EUserType,
  TRIAL_DAYS,
} from '@shared-libs';
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
  CheckoutPlanResponseModel,
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
import { RazorpaySubscriptionResult } from './razorpay-subscription-result';
import { IUsersRepository, USERS_REPOSITORY } from '../../users';
import {
  resolveCheckoutPlan,
  subscriptionTotalCount,
  subscriptionGrantsAccess,
  isTrialActive,
  resolveTrialEndsAt,
  trialDaysRemaining,
} from '../utils';

/** Same day next month / next year — when recurring billing starts after a paid first period. */
export function addBillingPeriod(from: Date, period: 'monthly' | 'yearly'): Date {
  const next = new Date(from);
  const day = next.getDate();
  next.setDate(1);
  if (period === 'yearly') next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  // 31 Jan + 1 month → 28/29 Feb, not 3 Mar.
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

/**
 * Billing dates from a Razorpay subscription. Before recurring billing starts (first period paid
 * upfront with a coupon) Razorpay has no current_end yet, so the paid period ends at start_at.
 */
export function rzpPeriod(rzp: RazorpaySubscriptionResult): {
  currentStart: Date;
  currentEnd: Date;
  nextBillingAt: Date;
} {
  const toDate = (sec?: number) => (sec ? new Date(sec * 1000) : null);
  const notStarted = !rzp.current_end && !!rzp.start_at;
  return {
    currentStart: toDate(rzp.current_start),
    currentEnd: notStarted ? toDate(rzp.start_at) : toDate(rzp.current_end),
    nextBillingAt: toDate(rzp.charge_at) ?? (notStarted ? toDate(rzp.start_at) : null),
  };
}

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

  /** `shopOrUserId` may be an extra shop or a shop someone was invited to: it runs on its owner's plan. */
  async hasAppAccess(shopOrUserId: string): Promise<boolean> {
    const shop = await this.usersRepo.findById(shopOrUserId);
    const userId = shop?.ownerUserId ?? shopOrUserId;
    if (await this.findPayingSubscription(userId)) return true;
    const user = userId === shopOrUserId ? shop : await this.usersRepo.findById(userId);
    if (!user) return false;
    return user.userType === EUserType.Admin || isTrialActive(user, TRIAL_DAYS);
  }

  async listCheckoutPlans(): Promise<CheckoutPlanResponseModel[]> {
    const plans = await this.plansRepo.findActiveCheckoutPlans();
    return plainToInstance(CheckoutPlanResponseModel, plans, { excludeExtraneousValues: true });
  }

  async createSubscription(
    userId: string,
    body: CreateSubscriptionRequestModel,
    userProfile: SubscriptionUserProfileData,
  ): Promise<CreateSubscriptionResponseModel> {
    const activePlan = await resolveCheckoutPlan(this.plansRepo, body.planId);
    const billingPeriod = activePlan.interval?.trim().toLowerCase() === 'yearly' ? 'yearly' : 'monthly';
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
          if (!this.checkoutTermsMatch(blocking, couponId, discountAmount, originalAmount)) {
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

    // The Razorpay plan always bills the full price. A coupon only lowers the first period:
    // that period is paid upfront at checkout and recurring billing starts one period later.
    const razorpayPlanId = (
      await this.razorpay.ensureBillingPlan(Math.round(originalAmount * 100), billingPeriod, currency)
    ).id;
    const firstPeriodDiscounted = discountAmount > 0;
    const startAt = firstPeriodDiscounted ? addBillingPeriod(new Date(), billingPeriod) : null;

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
          amount: originalAmount,
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
          amount: originalAmount,
          currency,
          couponId,
          discountAmount,
          cancelAtPeriodEnd: false,
          notes: subscriptionNotes,
        });

    const rzpSub = await this.razorpay.createSubscription(
      plainToInstance(RazorpayCreateSubscriptionData, {
        planId: razorpayPlanId,
        totalCount: subscriptionTotalCount(activePlan),
        currency,
        ...(startAt
          ? {
              startAt: Math.floor(startAt.getTime() / 1000),
              upfrontAmountPaise: Math.round(finalAmount * 100),
              upfrontLabel: `First ${billingPeriod === 'yearly' ? 'year' : 'month'} (coupon ${body.couponCode.trim().toUpperCase()})`,
            }
          : {}),
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
      ...rzpPeriod(rzpSub),
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

  /**
   * Plan / trial status. `userId` may be an extra shop: its plan is the owner's. `actorUserId` (the signed-in person)
   * tells whether they manage that plan themselves.
   */
  async getStatus(shopOrUserId: string, actorUserId?: string): Promise<SubscriptionStatusResponseModel> {
    const shop = await this.usersRepo.findById(shopOrUserId);
    const userId = shop?.ownerUserId ?? shopOrUserId;
    const managedByOwner = !!actorUserId && actorUserId !== userId;
    let latest = await this.subscriptionsRepo.findLatestByUserId(userId);
    if (latest?.providerSubscriptionId) {
      latest = await this.syncSubscriptionFromRazorpay(latest);
    }
    // A newer abandoned checkout must not hide an older plan that is still paid for.
    const paying = subscriptionGrantsAccess(latest) ? latest : await this.subscriptionsRepo.findActiveByUserId(userId);
    if (paying?.id && paying.id !== latest?.id) {
      latest = paying;
    }
    const active = !!paying;
    const activePlan = await this.plansRepo.findActiveDefault();
    const user = await this.usersRepo.findById(userId);
    const isAdmin = user?.userType === EUserType.Admin;
    const onTrial = !active && !!user && !isAdmin && isTrialActive(user, TRIAL_DAYS);
    const trialEndsAt = user ? resolveTrialEndsAt(user, TRIAL_DAYS) : null;
    const daysRemaining = user ? trialDaysRemaining(user, TRIAL_DAYS) : 0;

    return plainToInstance(
      SubscriptionStatusResponseModel,
      {
        hasActiveSubscription: !!active,
        managedByOwner,
        hasAppAccess: active || onTrial || isAdmin,
        // Ads were removed from the apps; kept false so older app versions never show them.
        showAds: false,
        isOnTrial: onTrial,
        trialDays: TRIAL_DAYS,
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
    if (sub.status === ESubscriptionStatus.Authenticated) {
      // Recurring billing hasn't started (first period was paid upfront). Razorpay can only cancel
      // it outright; the shop keeps access until the paid period ends (currentEnd).
      await this.razorpay.cancelSubscription(sub.providerSubscriptionId, false);
      await this.subscriptionsRepo.update(sub.id, {
        cancelAtPeriodEnd: true,
        status: ESubscriptionStatus.Cancelled,
        cancelledAt: new Date(),
      });
      return this.getStatus(userId);
    }
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
      // Razorpay has no way to undo a cancel-at-cycle-end, so clearing our flag would only
      // pretend the plan continues while Razorpay still ends it. Be honest instead.
      const ends = latest.currentEnd ? new Date(latest.currentEnd).toLocaleDateString('en-IN') : null;
      throw new BadRequestException(
        ends
          ? `This plan is already set to end on ${ends}. You can choose a plan again after that date.`
          : 'This plan is already set to end at the close of the billing period. You can choose a plan again after that.',
      );
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
    const activePlan = await resolveCheckoutPlan(this.plansRepo, body.planId);
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

  /** The subscription that currently pays for access (latest row first, then any active one). */
  private async findPayingSubscription(userId: string): Promise<Subscription | null> {
    const latest = await this.subscriptionsRepo.findLatestByUserId(userId);
    if (subscriptionGrantsAccess(latest)) return latest;
    return (await this.subscriptionsRepo.findActiveByUserId(userId)) ?? null;
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
    recurringAmount: number,
  ): boolean {
    return (
      (subscription.couponId ?? null) === couponId &&
      Number(subscription.discountAmount ?? 0) === discountAmount &&
      Number(subscription.amount) === recurringAmount
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
        // `amount` is the recurring price; a coupon only reduces the first payment.
        amount: Number(subscription.amount),
        currency: subscription.currency,
        discountAmount: Number(subscription.discountAmount ?? 0),
        finalAmount: Number(subscription.amount) - Number(subscription.discountAmount ?? 0),
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
        ...rzpPeriod(rzp),
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
        ...rzpPeriod(rzp),
      });

      // Active, or authenticated with the first period already paid upfront (coupon).
      if (mappedStatus === ESubscriptionStatus.Active || subscriptionGrantsAccess(updated)) {
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
