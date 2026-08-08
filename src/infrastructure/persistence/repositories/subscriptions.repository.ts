import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryDeepPartialEntity, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  DUPLICATE_BLOCKING_STATUSES,
  AdminSubscriptionListQuery,
  AdminSubscriptionListRow,
  ISubscriptionsRepository,
  Subscription,
  SubscriptionPatch,
} from '../../../application';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { ESubscriptionStatus } from '../../../application/features/payments/domain/enums';

@Injectable()
export class SubscriptionsRepository implements ISubscriptionsRepository {
  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepo: Repository<SubscriptionEntity>,
  ) {}

  private mapEntity(entity: SubscriptionEntity): Subscription {
    return plainToInstance(
      Subscription,
      {
        ...entity,
        amount: Number(entity.amount),
        discountAmount: Number(entity.discountAmount ?? 0),
      },
      { excludeExtraneousValues: true },
    );
  }

  async insert(data: Subscription): Promise<Subscription> {
    const entity = this.subscriptionRepo.create({
      userId: data.userId,
      planId: data.planId,
      provider: data.provider,
      providerSubscriptionId: data.providerSubscriptionId ?? null,
      providerCustomerId: data.providerCustomerId ?? null,
      status: data.status,
      currentStart: data.currentStart ?? null,
      currentEnd: data.currentEnd ?? null,
      nextBillingAt: data.nextBillingAt ?? null,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      cancelledAt: data.cancelledAt ?? null,
      amount: data.amount,
      currency: data.currency,
      couponId: data.couponId ?? null,
      discountAmount: data.discountAmount ?? 0,
      notes: data.notes ?? null,
    });
    const created = await this.subscriptionRepo.save(entity);
    return this.mapEntity(created);
  }

  async update(id: string, data: SubscriptionPatch): Promise<Subscription> {
    const updateData: QueryDeepPartialEntity<SubscriptionEntity> = {};
    if (data.planId !== undefined) updateData.planId = data.planId;
    if (data.provider !== undefined) updateData.provider = data.provider;
    if (data.providerSubscriptionId !== undefined) {
      updateData.providerSubscriptionId = data.providerSubscriptionId;
    }
    if (data.providerCustomerId !== undefined) updateData.providerCustomerId = data.providerCustomerId;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.currentStart !== undefined) updateData.currentStart = data.currentStart;
    if (data.currentEnd !== undefined) updateData.currentEnd = data.currentEnd;
    if (data.nextBillingAt !== undefined) updateData.nextBillingAt = data.nextBillingAt;
    if (data.cancelAtPeriodEnd !== undefined) updateData.cancelAtPeriodEnd = data.cancelAtPeriodEnd;
    if (data.cancelledAt !== undefined) updateData.cancelledAt = data.cancelledAt;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.couponId !== undefined) updateData.couponId = data.couponId;
    if (data.discountAmount !== undefined) updateData.discountAmount = data.discountAmount;
    if (data.notes !== undefined) {
      updateData.notes = data.notes as object;
    }

    await this.subscriptionRepo.update(id, updateData);
    const updated = await this.subscriptionRepo.findOne({ where: { id } });
    if (!updated) {
      throw new Error(`Subscription ${id} not found after update`);
    }
    return this.mapEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await this.subscriptionRepo.delete(id);
  }

  async findById(id: string): Promise<Subscription> {
    const entity = await this.subscriptionRepo.findOne({ where: { id } });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findByProviderSubscriptionId(providerSubscriptionId: string): Promise<Subscription> {
    const entity = await this.subscriptionRepo.findOne({
      where: { providerSubscriptionId },
    });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findLatestByProviderCustomerId(providerCustomerId: string): Promise<Subscription> {
    const entity = await this.subscriptionRepo.findOne({
      where: { providerCustomerId },
      order: { createdAt: 'DESC' },
    });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findLatestByUserId(userId: string): Promise<Subscription> {
    const entity = await this.subscriptionRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findActiveByUserId(userId: string): Promise<Subscription> {
    const entity = await this.subscriptionRepo.findOne({
      where: { userId, status: In(ACTIVE_SUBSCRIPTION_STATUSES) },
      order: { createdAt: 'DESC' },
    });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findBlockingByUserId(userId: string): Promise<Subscription> {
    const entity = await this.subscriptionRepo.findOne({
      where: { userId, status: In(DUPLICATE_BLOCKING_STATUSES) },
      order: { createdAt: 'DESC' },
    });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findAllAdmin(query: AdminSubscriptionListQuery): Promise<{
    items: AdminSubscriptionListRow[];
    totalCount: number;
  }> {
    const page = Math.max(1, query.page);
    const pageSize = Math.min(100, Math.max(1, query.pageSize));
    const skip = (page - 1) * pageSize;

    const qb = this.subscriptionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'user');

    if (query.status === 'active') {
      qb.andWhere('s.status = :status', { status: ESubscriptionStatus.Active });
    } else if (query.status === 'cancelled') {
      qb.andWhere('s.status = :status', { status: ESubscriptionStatus.Cancelled });
    } else if (query.status === 'pending') {
      qb.andWhere('s.status = :status', { status: ESubscriptionStatus.Pending });
    } else if (query.status === 'halted') {
      qb.andWhere('s.status = :status', { status: ESubscriptionStatus.Halted });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)`,
        { search: `%${search}%` },
      );
    }

    qb.orderBy('s.createdAt', 'DESC').skip(skip).take(pageSize);
    const [entities, totalCount] = await qb.getManyAndCount();

    const items: AdminSubscriptionListRow[] = entities.map((entity) => ({
      subscription: this.mapEntity(entity),
      userEmail: entity.user?.email ?? '',
      userFirstName: entity.user?.firstName ?? null,
      userLastName: entity.user?.lastName ?? null,
      planName: null,
    }));

    return { items, totalCount };
  }
}
