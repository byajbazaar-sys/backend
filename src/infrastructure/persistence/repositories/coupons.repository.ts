import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import { Coupon, ICouponsRepository } from '../../../application';
import { CouponEntity } from '../entities';

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
        maximumDiscount: entity.maximumDiscount != null ? Number(entity.maximumDiscount) : null,
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

  async findAll(): Promise<Coupon[]> {
    const entities = await this.couponRepo.find({ order: { createdAt: 'DESC' } });
    return entities.map((entity) => this.mapEntity(entity));
  }

  async insert(data: Partial<Coupon>): Promise<Coupon> {
    const saved = await this.couponRepo.save(this.couponRepo.create(data as Partial<CouponEntity>));
    return this.mapEntity(saved);
  }

  async update(id: string, data: Partial<Coupon>): Promise<Coupon> {
    await this.couponRepo.update({ id }, data as Partial<CouponEntity>);
    const updated = await this.couponRepo.findOne({ where: { id } });
    if (!updated) throw new Error(`Coupon ${id} not found`);
    return this.mapEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await this.couponRepo.delete({ id });
  }
}
