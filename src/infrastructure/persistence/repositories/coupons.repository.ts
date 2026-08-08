import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { Coupon, ICouponsRepository } from '../../../application';
import { CouponEntity } from '../entities/coupon.entity';

@Injectable()
export class CouponsRepository implements ICouponsRepository {
  constructor(
    @InjectRepository(CouponEntity)
    private readonly couponRepo: Repository<CouponEntity>,
  ) {}

  private mapEntity(entity: CouponEntity): Coupon {
    return plainToInstance(
      Coupon,
      {
        ...entity,
        value: Number(entity.value),
        minimumAmount: Number(entity.minimumAmount),
        maximumDiscount:
          entity.maximumDiscount != null ? Number(entity.maximumDiscount) : null,
      },
      { excludeExtraneousValues: true },
    );
  }

  async findByCode(code: string): Promise<Coupon> {
    const entity = await this.couponRepo.findOne({
      where: { code: code.trim().toUpperCase() },
    });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findById(id: string): Promise<Coupon> {
    const entity = await this.couponRepo.findOne({ where: { id } });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async incrementUsedCount(id: string): Promise<Coupon> {
    await this.couponRepo.increment({ id }, 'usedCount', 1);
    const updated = await this.couponRepo.findOne({ where: { id } });
    if (!updated) {
      throw new Error(`Coupon ${id} not found after increment`);
    }
    return this.mapEntity(updated);
  }
}
