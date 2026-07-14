import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { CouponRedemption, ICouponRedemptionsRepository } from '../../../application';
import { CouponRedemptionEntity } from '../entities/coupon-redemption.entity';

@Injectable()
export class CouponRedemptionsRepository implements ICouponRedemptionsRepository {
  constructor(
    @InjectRepository(CouponRedemptionEntity)
    private readonly couponRedemptionRepo: Repository<CouponRedemptionEntity>,
  ) {}

  private mapEntity(entity: CouponRedemptionEntity): CouponRedemption {
    return plainToInstance(
      CouponRedemption,
      {
        ...entity,
        discountAmount: Number(entity.discountAmount),
      },
      { excludeExtraneousValues: true },
    );
  }

  async insert(data: CouponRedemption): Promise<CouponRedemption> {
    const entity = this.couponRedemptionRepo.create({
      couponId: data.couponId,
      userId: data.userId,
      subscriptionId: data.subscriptionId ?? null,
      discountAmount: data.discountAmount,
    });
    const created = await this.couponRedemptionRepo.save(entity);
    return this.mapEntity(created);
  }

  async findByCouponAndUser(couponId: string, userId: string): Promise<CouponRedemption | null> {
    const entity = await this.couponRedemptionRepo.findOne({
      where: { couponId, userId },
    });
    if (!entity) return null;
    return this.mapEntity(entity);
  }
}
