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

/**
 * Paywall: after the {@link TRIAL_DAYS}-day trial a shop needs an active plan to use the app.
 * Responds 402 with `code: SUBSCRIPTION_REQUIRED` so the apps can open the plans screen.
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

    const until = await this.accessUntil(identity.userId);
    if (until > now) {
      this.allowedUntil.set(identity.userId, Math.min(until, now + ACCESS_CACHE_MS));
      return;
    }
    this.allowedUntil.delete(identity.userId);
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        code: SUBSCRIPTION_REQUIRED_CODE,
        message: `Your ${TRIAL_DAYS}-day trial has ended. Choose a plan to continue using ByajBazaar.`,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  /**
   * Epoch ms until which the shop may use the app; 0 when it needs a plan. Extra shops an owner added run on the
   * owner's plan (and trial).
   */
  private async accessUntil(shopId: string): Promise<number> {
    const shop = await this.usersRepo.findById(shopId);
    const userId = shop?.ownerUserId ?? shopId;
    const latest = await this.subscriptionsRepo.findLatestByUserId(userId);
    if (subscriptionGrantsAccess(latest)) {
      const end = latest.currentEnd ? new Date(latest.currentEnd).getTime() : 0;
      // Active plans renew; only trust the period end for plans that won't renew.
      return end > Date.now() &&
        latest.status !== ESubscriptionStatus.Active &&
        latest.status !== ESubscriptionStatus.Pending
        ? end
        : Number.MAX_SAFE_INTEGER;
    }
    const active = await this.subscriptionsRepo.findActiveByUserId(userId);
    if (active) return Number.MAX_SAFE_INTEGER;

    const user = await this.usersRepo.findById(userId);
    if (!user) return 0;
    if (user.userType === EUserType.Admin) return Number.MAX_SAFE_INTEGER;
    return isTrialActive(user, TRIAL_DAYS) ? resolveTrialEndsAt(user, TRIAL_DAYS).getTime() : 0;
  }
}
