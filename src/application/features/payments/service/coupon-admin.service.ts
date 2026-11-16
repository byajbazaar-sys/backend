import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

import { ACTIVITY_LOGGER, EActivityLogCategory, IActivityLogger } from '../../../shared';
import { Coupon, ECouponType, Plan } from '../domain';
import {
  CouponPlanPreviewModel,
  CouponResponseModel,
  CreateCouponRequestModel,
  UpdateCouponRequestModel,
} from '../models';
import { COUPON_SERVICE, ICouponService } from './i-coupon.service';
import { COUPONS_REPOSITORY, ICouponsRepository } from './i-coupons.repository';
import { IPlansRepository, PLANS_REPOSITORY } from './i-plans.repository';

/** Razorpay's smallest chargeable amount. */
const RAZORPAY_MIN_CHARGE_INR = 1;

/**
 * Admin coupon management. Razorpay has no coupon/offer API (offers are dashboard-only), so a
 * coupon lives here and reaches Razorpay at checkout: the subscription is created on the
 * full-price plan with the discounted first period as an upfront addon named after the coupon,
 * and the code is stored in the subscription notes. That's what each preview below shows.
 */
@Injectable()
export class CouponAdminService {
  constructor(
    @Inject(COUPONS_REPOSITORY) private readonly couponsRepo: ICouponsRepository,
    @Inject(PLANS_REPOSITORY) private readonly plansRepo: IPlansRepository,
    @Inject(COUPON_SERVICE) private readonly couponService: ICouponService,
    @Inject(ACTIVITY_LOGGER) private readonly activityLogger: IActivityLogger,
  ) {}

  /** Coupon changes go to the activity log; the admin is taken from the request. Never throws. */
  private audit(action: string, coupon: Pick<Coupon, 'id' | 'code'>, data: Record<string, unknown>): Promise<void> {
    return this.activityLogger.record({
      category: EActivityLogCategory.Payment,
      action,
      entityType: 'coupon',
      entityId: coupon.id,
      data: { code: coupon.code, byAdmin: true, ...data },
    });
  }

  async list(): Promise<CouponResponseModel[]> {
    const [coupons, plans] = await Promise.all([this.couponsRepo.findAll(), this.plansRepo.findActiveCheckoutPlans()]);
    return coupons.map((coupon) => this.toResponse(coupon, plans));
  }

  async create(body: CreateCouponRequestModel): Promise<CouponResponseModel> {
    const code = body.code.trim().toUpperCase();
    if (await this.couponsRepo.findByCode(code)) {
      throw new ConflictException(`Coupon ${code} already exists`);
    }
    const draft: Partial<Coupon> = {
      code,
      type: body.type,
      value: Number(body.value),
      minimumAmount: Number(body.minimumAmount ?? 0),
      maximumDiscount:
        body.type === ECouponType.Percentage && body.maximumDiscount ? Number(body.maximumDiscount) : null,
      expiry: body.expiry ? new Date(body.expiry) : null,
      maximumRedemption: body.maximumRedemption ?? null,
      oncePerUser: body.oncePerUser ?? true,
      active: body.active ?? true,
      usedCount: 0,
    };
    const plans = await this.plansRepo.findActiveCheckoutPlans();
    this.assertChargeable(draft as Coupon, plans);
    if (draft.expiry && draft.expiry.getTime() <= Date.now()) {
      throw new BadRequestException('Expiry must be in the future');
    }
    const created = await this.couponsRepo.insert(draft);
    await this.audit('COUPON_CREATED', created, { coupon: draft });
    return this.toResponse(created, plans);
  }

  async update(id: string, body: UpdateCouponRequestModel): Promise<CouponResponseModel> {
    const existing = await this.couponsRepo.findById(id);
    if (!existing) throw new NotFoundException('Coupon not found');
    const changesDiscount =
      (body.type && body.type !== existing.type) ||
      (body.value !== undefined && body.value !== null && Number(body.value) !== Number(existing.value));
    if (changesDiscount && Number(existing.usedCount) > 0) {
      throw new BadRequestException(
        'This coupon has been used, so its discount can’t change. Create a new coupon instead.',
      );
    }
    const patch: Partial<Coupon> = {};
    if (body.type) patch.type = body.type;
    if (body.value !== undefined && body.value !== null) patch.value = Number(body.value);
    if (body.minimumAmount !== undefined && body.minimumAmount !== null)
      patch.minimumAmount = Number(body.minimumAmount);
    if (body.maximumDiscount !== undefined)
      patch.maximumDiscount = body.maximumDiscount ? Number(body.maximumDiscount) : null;
    if (body.expiry !== undefined) patch.expiry = body.expiry ? new Date(body.expiry) : null;
    if (body.maximumRedemption !== undefined) patch.maximumRedemption = body.maximumRedemption ?? null;
    if (body.oncePerUser !== undefined) patch.oncePerUser = body.oncePerUser;
    if (body.active !== undefined) patch.active = body.active;

    const plans = await this.plansRepo.findActiveCheckoutPlans();
    const next = { ...existing, ...patch } as Coupon;
    if (next.type === ECouponType.Percentage && Number(next.value) > 99) {
      throw new BadRequestException('A percentage coupon can be at most 99% off');
    }
    this.assertChargeable(next, plans);
    const updated = await this.couponsRepo.update(id, patch);
    const before = Object.fromEntries(Object.keys(patch).map((key) => [key, existing[key as keyof Coupon]]));
    await this.audit('COUPON_UPDATED', existing, { before, after: patch });
    return this.toResponse(updated, plans);
  }

  /** Unused coupons are deleted; used ones are switched off so past bills keep their history. */
  async remove(id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
    const existing = await this.couponsRepo.findById(id);
    if (!existing) throw new NotFoundException('Coupon not found');
    if (Number(existing.usedCount) === 0) {
      try {
        await this.couponsRepo.delete(id);
        await this.audit('COUPON_DELETED', existing, { coupon: existing });
        return { deleted: true, deactivated: false };
      } catch {
        // Referenced by a checkout that was started with it: keep the row.
      }
    }
    await this.couponsRepo.update(id, { active: false });
    await this.audit('COUPON_DEACTIVATED', existing, { usedCount: Number(existing.usedCount) });
    return { deleted: false, deactivated: true };
  }

  /** The first payment must stay chargeable (≥ ₹1) on every plan the coupon applies to. */
  private assertChargeable(coupon: Coupon, plans: Plan[]): void {
    for (const preview of this.planPreview(coupon, plans)) {
      if (preview.applies && preview.firstPayment < RAZORPAY_MIN_CHARGE_INR) {
        throw new BadRequestException(
          `This coupon would make the first ${preview.interval === 'yearly' ? 'year' : 'month'} (₹${preview.price}) free. Razorpay needs at least ₹${RAZORPAY_MIN_CHARGE_INR} — lower the discount or set a cap.`,
        );
      }
    }
  }

  private planPreview(coupon: Coupon, plans: Plan[]): CouponPlanPreviewModel[] {
    return plans.map((plan) => {
      const price = Number(plan.price);
      const applies = Number(coupon.minimumAmount ?? 0) <= price;
      const discount = applies ? this.couponService.calculateDiscount(coupon, price) : 0;
      return {
        planName: plan.name,
        interval: plan.interval,
        price,
        firstPayment: Math.round((price - discount) * 100) / 100,
        applies,
      };
    });
  }

  private toResponse(coupon: Coupon, plans: Plan[]): CouponResponseModel {
    return plainToInstance(
      CouponResponseModel,
      { ...coupon, planPreview: this.planPreview(coupon, plans) },
      { excludeExtraneousValues: true },
    );
  }
}
