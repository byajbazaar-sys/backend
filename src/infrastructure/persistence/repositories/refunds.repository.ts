import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { IRefundsRepository, Refund } from '../../../application';
import { RefundEntity } from '../entities/refund.entity';

@Injectable()
export class RefundsRepository implements IRefundsRepository {
  constructor(
    @InjectRepository(RefundEntity)
    private readonly refundRepo: Repository<RefundEntity>,
  ) {}

  private mapEntity(entity: RefundEntity): Refund {
    return plainToInstance(
      Refund,
      {
        ...entity,
        amount: Number(entity.amount),
      },
      { excludeExtraneousValues: true },
    );
  }

  async insert(data: Refund): Promise<Refund> {
    const entity = this.refundRepo.create({
      paymentId: data.paymentId,
      providerRefundId: data.providerRefundId,
      amount: data.amount,
      status: data.status,
      reason: data.reason ?? null,
      rawJson: data.rawJson ?? {},
    });
    const created = await this.refundRepo.save(entity);
    return this.mapEntity(created);
  }

  async upsertByProviderRefundId(data: Refund): Promise<Refund> {
    const existing = await this.refundRepo.findOne({
      where: { providerRefundId: data.providerRefundId },
    });

    if (existing) {
      const updateData: QueryDeepPartialEntity<RefundEntity> = {
        paymentId: data.paymentId,
        amount: data.amount,
        status: data.status,
        reason: data.reason ?? null,
        rawJson: (data.rawJson ?? {}) as object,
      };
      await this.refundRepo.update(existing.id, updateData);
      const updated = await this.refundRepo.findOne({ where: { id: existing.id } });
      if (!updated) {
        throw new Error(`Refund ${existing.id} not found after update`);
      }
      return this.mapEntity(updated);
    }

    return this.insert(data);
  }

  async findByProviderRefundId(providerRefundId: string): Promise<Refund | null> {
    const entity = await this.refundRepo.findOne({ where: { providerRefundId } });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findByPaymentId(paymentId: string): Promise<Refund[]> {
    const entities = await this.refundRepo.find({
      where: { paymentId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((entity) => this.mapEntity(entity));
  }

  async findByPaymentIds(paymentIds: string[]): Promise<Refund[]> {
    if (!paymentIds.length) return [];
    const entities = await this.refundRepo
      .createQueryBuilder('r')
      .where('r.payment_id IN (:...paymentIds)', { paymentIds })
      .orderBy('r.created_at', 'DESC')
      .getMany();
    return entities.map((entity) => this.mapEntity(entity));
  }
}
