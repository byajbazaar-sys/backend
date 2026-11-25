import { ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { EUserType, IIdentity, ISubscriptionAccessChecker, TRIAL_DAYS } from '@shared-libs';
import { Request } from 'express';

import { IUsersRepository, USERS_REPOSITORY } from '../../users';
import { ESubscriptionStatus } from '../domain';
import { ISubscriptionsRepository, SUBSCRIPTIONS_REPOSITORY } from '../service';
import {
  isPaywallExemptPath,
  SUBSCRIPTION_REQUIRED_CODE,
  subscriptionGrantsAccess,
  isTrialActive,
  resolveTrialEndsAt,
} from '../utils';
/** Positive answers are cached briefly so every API call doesn't hit the database twice. */
const ACCESS_CACHE_MS = 5 * 60 * 1000;

interface ShopAccessWindow {
  /** Epoch ms until which the shop may use the app; 0 when it needs a plan. */
  until: number;
  /** The account whose plan / trial covers the shop (the owner for extra shops). */
  billingUserId: string;
  /** The billing account ever had a subscription (its plan ended, as opposed to only a trial). */
  hadPlan: boolean;
}

/**
 * Paywall: after the {@link TRIAL_DAYS}-day trial a shop needs an active plan to use the app.
 * Responds 402 with `code: SUBSCRIPTION_REQUIRED` so the apps can open the plans screen.
 *
 * The plan belongs to the shop's owner: invited members and the owner's extra shops run on it, so members never need
 * a plan of their own to work in someone else's shop — and when the owner renews, every member gets access back.
 */
@Injectable()
export class SubscriptionAccessChecker implements ISubscriptionAccessChecker {
  private readonly allowedUntil = new Map<string, number>();

  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(SUBSCRIPTIONS_REPOSITORY) private readonly subscriptionsRepo: ISubscriptionsRepository,
  ) {}

  async assertAccess(identity: IIdentity, context: ExecutionContext): Promise<void> {
    if (!identity?.userId || identity.userType === EUserType.Admin) return;

    const request = context.switchToHttp().getRequest<Request>();
    const path = request?.originalUrl || request?.url || '';
    if (isPaywallExemptPath(path)) return;

    const now = Date.now();
    const cached = this.allowedUntil.get(identity.userId);
    if (cached && cached > now) return;

    const window = await this.accessWindow(identity.userId);
    if (window.until > now) {
      this.allowedUntil.set(identity.userId, Math.min(window.until, now + ACCESS_CACHE_MS));
      return;
    }
    this.allowedUntil.delete(identity.userId);

    // Working in someone else's shop (invited member): only the owner can renew, so don't ask this person to pay.
    const actorUserId = identity.actorUserId ?? identity.userId;
    const managedByOwner = actorUserId !== window.billingUserId;
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        code: SUBSCRIPTION_REQUIRED_CODE,
        managedByOwner,
        message: managedByOwner
          ? 'This shop’s plan has ended. Ask the shop owner to renew it to continue.'
          : window.hadPlan
            ? 'Your plan has ended. Renew it to continue using ByajBazaar.'
            : `Your ${TRIAL_DAYS}-day trial has ended. Choose a plan to continue using ByajBazaar.`,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  /** Extra shops an owner added, and shops members were invited to, run on the owner's plan (and trial). */
  private async accessWindow(shopId: string): Promise<ShopAccessWindow> {
    const shop = await this.usersRepo.findById(shopId);
    const billingUserId = shop?.ownerUserId ?? shopId;
    const latest = await this.subscriptionsRepo.findLatestByUserId(billingUserId);
    if (subscriptionGrantsAccess(latest)) {
      const end = latest.currentEnd ? new Date(latest.currentEnd).getTime() : 0;
      // Active plans renew; only trust the period end for plans that won't renew.
      const until =
        end > Date.now() &&
        latest.status !== ESubscriptionStatus.Active &&
        latest.status !== ESubscriptionStatus.Pending
          ? end
          : Number.MAX_SAFE_INTEGER;
      return { until, billingUserId, hadPlan: true };
    }
    const active = await this.subscriptionsRepo.findActiveByUserId(billingUserId);
    if (active) return { until: Number.MAX_SAFE_INTEGER, billingUserId, hadPlan: true };

    const hadPlan = !!latest && latest.status !== ESubscriptionStatus.Created;
    const owner = billingUserId === shopId ? shop : await this.usersRepo.findById(billingUserId);
    if (!owner) return { until: 0, billingUserId, hadPlan };
    if (owner.userType === EUserType.Admin) return { until: Number.MAX_SAFE_INTEGER, billingUserId, hadPlan };
    const until = isTrialActive(owner, TRIAL_DAYS) ? resolveTrialEndsAt(owner, TRIAL_DAYS).getTime() : 0;
    return { until, billingUserId, hadPlan };
  }
}
