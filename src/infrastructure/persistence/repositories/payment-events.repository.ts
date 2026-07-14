import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { IPaymentEventsRepository, PaymentEvent } from '../../../application';
import { PaymentEventEntity } from '../entities/payment-event.entity';

@Injectable()
export class PaymentEventsRepository implements IPaymentEventsRepository {
  constructor(
    @InjectRepository(PaymentEventEntity)
    private readonly paymentEventRepo: Repository<PaymentEventEntity>,
  ) {}

  private mapEntity(entity: PaymentEventEntity): PaymentEvent {
    return plainToInstance(PaymentEvent, entity, { excludeExtraneousValues: true });
  }

  async insert(data: PaymentEvent): Promise<PaymentEvent> {
    const entity = this.paymentEventRepo.create({
      provider: data.provider,
      eventId: data.eventId,
      eventName: data.eventName,
      processed: data.processed ?? false,
      signature: data.signature ?? null,
      payload: data.payload,
      userId: data.userId ?? null,
      paymentId: data.paymentId ?? null,
      paymentOrderId: data.paymentOrderId ?? null,
    });
    const created = await this.paymentEventRepo.save(entity);
    return this.mapEntity(created);
  }

  async findByProviderAndEventId(provider: string, eventId: string): Promise<PaymentEvent | null> {
    const entity = await this.paymentEventRepo.findOne({ where: { provider, eventId } });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async markProcessed(id: string): Promise<PaymentEvent> {
    await this.paymentEventRepo.update(id, { processed: true });
    const updated = await this.paymentEventRepo.findOne({ where: { id } });
    if (!updated) {
      throw new Error(`Payment event ${id} not found after update`);
    }
    return this.mapEntity(updated);
  }

  async updateLinks(
    id: string,
    data: {
      userId?: string | null;
      paymentId?: string | null;
      paymentOrderId?: string | null;
    },
  ): Promise<PaymentEvent> {
    const patch: QueryDeepPartialEntity<PaymentEventEntity> = {};
    if (data.userId !== undefined) patch.userId = data.userId;
    if (data.paymentId !== undefined) patch.paymentId = data.paymentId;
    if (data.paymentOrderId !== undefined) patch.paymentOrderId = data.paymentOrderId;

    if (Object.keys(patch).length === 0) {
      const existing = await this.paymentEventRepo.findOne({ where: { id } });
      if (!existing) {
        throw new Error(`Payment event ${id} not found`);
      }
      return this.mapEntity(existing);
    }

    await this.paymentEventRepo.update(id, patch);
    const updated = await this.paymentEventRepo.findOne({ where: { id } });
    if (!updated) {
      throw new Error(`Payment event ${id} not found after update`);
    }
    return this.mapEntity(updated);
  }

  async findByProviderSubscriptionId(
    providerSubscriptionId: string,
    limit = 50,
  ): Promise<PaymentEvent[]> {
    const entities = await this.paymentEventRepo
      .createQueryBuilder('e')
      .where(`e.payload::text ILIKE :pattern`, { pattern: `%${providerSubscriptionId}%` })
      .orderBy('e.created_at', 'DESC')
      .take(limit)
      .getMany();
    return entities.map((entity) => this.mapEntity(entity));
  }

  async findUnlinkedByProviderPaymentId(providerPaymentId: string): Promise<PaymentEvent[]> {
    const entities = await this.paymentEventRepo
      .createQueryBuilder('e')
      .where('e.user_id IS NULL')
      .andWhere('e.payment_id IS NULL')
      .andWhere('e.payment_order_id IS NULL')
      .andWhere(`e.payload::text ILIKE :pattern`, { pattern: `%${providerPaymentId}%` })
      .orderBy('e.created_at', 'ASC')
      .getMany();
    return entities.map((entity) => this.mapEntity(entity));
  }
}
