import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ECouponType, ESubscriptionStatus } from '../domain';
import { ApplyCouponResponseModel } from '../models';
import { Coupon, CouponRedemption, Subscription } from '../domain';
import { COUPONS_REPOSITORY, ICouponsRepository } from './i-coupons.repository';
import {
  COUPON_REDEMPTIONS_REPOSITORY,
  ICouponRedemptionsRepository,
} from './i-coupon-redemptions.repository';
import { CouponPreview, ICouponService } from './i-coupon.service';
import { RazorpayOptions } from '../../../shared';
import { IPlansRepository, PLANS_REPOSITORY } from './i-plans.repository';
import {
  ISubscriptionsRepository,
  SUBSCRIPTIONS_REPOSITORY,
} from './i-subscriptions.repository';
import { requireCheckoutPlan } from '../utils/checkout-plan.util';

@Injectable()
export class CouponService implements ICouponService {
  constructor(
    private readonly razorpayOptions: RazorpayOptions,
    @Inject(COUPONS_REPOSITORY) private readonly couponsRepo: ICouponsRepository,
    @Inject(COUPON_REDEMPTIONS_REPOSITORY)
    private readonly redemptionsRepo: ICouponRedemptionsRepository,
    @Inject(PLANS_REPOSITORY) private readonly plansRepo: IPlansRepository,
    @Inject(SUBSCRIPTIONS_REPOSITORY) private readonly subscriptionsRepo: ISubscriptionsRepository,
  ) {}

  calculateDiscount(coupon: Coupon, originalAmount: number): number {
    let discount = 0;
    if (coupon.type === ECouponType.Flat) {
      discount = Number(coupon.value);
    } else if (coupon.type === ECouponType.Percentage) {
      discount = (originalAmount * Number(coupon.value)) / 100;
      if (coupon.maximumDiscount != null) {
        discount = Math.min(discount, Number(coupon.maximumDiscount));
      }
    }
    discount = Math.max(0, Math.min(discount, originalAmount));
    return Math.round(discount * 100) / 100;
  }

  async preview(code: string, userId: string, originalAmount?: number): Promise<CouponPreview> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException('Coupon code is required');
    }

    const coupon = await this.couponsRepo.findByCode(normalized);
    if (!coupon) {
      throw new NotFoundException('Invalid coupon code');
    }
    if (!coupon.active) {
      throw new BadRequestException('Coupon is inactive');
    }
    if (coupon.expiry && new Date(coupon.expiry) < new Date()) {
      throw new BadRequestException('Coupon has expired');
    }
    if (
      coupon.maximumRedemption != null &&
      Number(coupon.usedCount) >= Number(coupon.maximumRedemption)
    ) {
      throw new BadRequestException('Coupon redemption limit reached');
    }

    const amount =
      originalAmount ??
      Number((await requireCheckoutPlan(this.plansRepo)).price);
    if (Number(coupon.minimumAmount) > amount) {
      throw new BadRequestException(
        `Minimum subscription amount for this coupon is ₹${coupon.minimumAmount}`,
      );
    }

    if (coupon.oncePerUser !== false) {
      const existing = await this.redemptionsRepo.findByCouponAndUser(coupon.id!, userId);
      if (existing && (await this.isConsumingRedemption(existing))) {
        throw new BadRequestException('You have already redeemed this coupon');
      }
    }

    const discountAmount = this.calculateDiscount(coupon, amount);
    const finalAmount = Math.round((amount - discountAmount) * 100) / 100;
    if (finalAmount <= 0) {
      throw new BadRequestException('Discounted amount must be greater than zero');
    }

    return {
      coupon,
      discountAmount,
      originalAmount: amount,
      finalAmount,
      currency: this.razorpayOptions.planCurrency,
    };
  }

  toResponse(preview: CouponPreview): ApplyCouponResponseModel {
    return plainToInstance(
      ApplyCouponResponseModel,
      {
        code: preview.coupon.code,
        type: preview.coupon.type,
        value: Number(preview.coupon.value),
        discountAmount: preview.discountAmount,
        originalAmount: preview.originalAmount,
        finalAmount: preview.finalAmount,
        currency: preview.currency,
      },
      { excludeExtraneousValues: true },
    );
  }

  async recordRedemptionForSubscription(subscription: Subscription): Promise<void> {
    if (!subscription.couponId || !subscription.id) {
      return;
    }

    const existingBySubscription = await this.redemptionsRepo.findBySubscriptionId(subscription.id);
    if (existingBySubscription) {
      return;
    }

    const existingByUser = await this.redemptionsRepo.findByCouponAndUser(
      subscription.couponId,
      subscription.userId,
    );
    if (existingByUser) {
      if (await this.isConsumingRedemption(existingByUser)) {
        return;
      }
      if (existingByUser.id) {
        await this.redemptionsRepo.deleteById(existingByUser.id);
      }
    }

    const discountAmount = Number(subscription.discountAmount ?? 0);
    if (discountAmount <= 0) {
      return;
    }

    await this.redemptionsRepo.insert({
      couponId: subscription.couponId,
      userId: subscription.userId,
      subscriptionId: subscription.id,
      discountAmount,
    });
    await this.couponsRepo.incrementUsedCount(subscription.couponId);
  }

  private async isConsumingRedemption(redemption: CouponRedemption): Promise<boolean> {
    if (!redemption.subscriptionId) {
      return true;
    }

    const sub = await this.subscriptionsRepo.findById(redemption.subscriptionId);
    if (!sub) {
      return false;
    }

    return (
      sub.status === ESubscriptionStatus.Active ||
      sub.status === ESubscriptionStatus.Completed ||
      sub.status === ESubscriptionStatus.Authenticated
    );
  }
}
