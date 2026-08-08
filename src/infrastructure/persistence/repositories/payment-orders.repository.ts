import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { IPaymentOrdersRepository, PaymentOrder } from '../../../application';
import { PaymentOrderEntity } from '../entities/payment-order.entity';

@Injectable()
export class PaymentOrdersRepository implements IPaymentOrdersRepository {
  constructor(
    @InjectRepository(PaymentOrderEntity)
    private readonly paymentOrderRepo: Repository<PaymentOrderEntity>,
  ) {}

  private mapEntity(entity: PaymentOrderEntity): PaymentOrder {
    return plainToInstance(
      PaymentOrder,
      {
        ...entity,
        amount: Number(entity.amount),
      },
      { excludeExtraneousValues: true },
    );
  }

  async insert(data: PaymentOrder): Promise<PaymentOrder> {
    const entity = this.paymentOrderRepo.create({
      userId: data.userId,
      subscriptionId: data.subscriptionId ?? null,
      providerOrderId: data.providerOrderId ?? null,
      receipt: data.receipt ?? null,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
      notes: data.notes ?? null,
      rawJson: data.rawJson ?? {},
    });
    const created = await this.paymentOrderRepo.save(entity);
    return this.mapEntity(created);
  }

  async findByProviderOrderId(providerOrderId: string): Promise<PaymentOrder> {
    const entity = await this.paymentOrderRepo.findOne({ where: { providerOrderId } });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findBySubscriptionId(subscriptionId: string): Promise<PaymentOrder[]> {
    const entities = await this.paymentOrderRepo.find({
      where: { subscriptionId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((entity) => this.mapEntity(entity));
  }
}
