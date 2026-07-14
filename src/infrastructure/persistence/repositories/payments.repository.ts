import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { getPaginationValues, Paged, toPaged } from '@shared-libs';
import { IPaymentsRepository, Payment } from '../../../application';
import { PaymentEntity } from '../entities/payment.entity';

@Injectable()
export class PaymentsRepository implements IPaymentsRepository {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
  ) {}

  private mapEntity(entity: PaymentEntity): Payment {
    return plainToInstance(
      Payment,
      {
        ...entity,
        amount: Number(entity.amount),
        fee: entity.fee != null ? Number(entity.fee) : null,
        tax: entity.tax != null ? Number(entity.tax) : null,
      },
      { excludeExtraneousValues: true },
    );
  }

  async insert(data: Payment): Promise<Payment> {
    const entity = this.paymentRepo.create({
      userId: data.userId,
      subscriptionId: data.subscriptionId ?? null,
      providerPaymentId: data.providerPaymentId,
      providerOrderId: data.providerOrderId ?? null,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
      method: data.method ?? null,
      bank: data.bank ?? null,
      wallet: data.wallet ?? null,
      upi: data.upi ?? null,
      fee: data.fee ?? null,
      tax: data.tax ?? null,
      capturedAt: data.capturedAt ?? null,
      invoiceId: data.invoiceId ?? null,
      rawJson: data.rawJson ?? {},
    });
    const created = await this.paymentRepo.save(entity);
    return this.mapEntity(created);
  }

  async upsertByProviderPaymentId(data: Payment): Promise<Payment> {
    const existing = await this.paymentRepo.findOne({
      where: { providerPaymentId: data.providerPaymentId },
    });

    if (existing) {
      const updateData: QueryDeepPartialEntity<PaymentEntity> = {
        userId: data.userId,
        subscriptionId: data.subscriptionId ?? null,
        providerOrderId: data.providerOrderId ?? null,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        method: data.method ?? null,
        bank: data.bank ?? null,
        wallet: data.wallet ?? null,
        upi: data.upi ?? null,
        fee: data.fee ?? null,
        tax: data.tax ?? null,
        capturedAt: data.capturedAt ?? null,
        invoiceId: data.invoiceId ?? null,
        rawJson: (data.rawJson ?? {}) as object,
      };
      await this.paymentRepo.update(existing.id, updateData);
      const updated = await this.paymentRepo.findOne({ where: { id: existing.id } });
      return this.mapEntity(updated!);
    }

    return this.insert(data);
  }

  async findById(id: string): Promise<Payment | null> {
    const entity = await this.paymentRepo.findOne({ where: { id } });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findByProviderPaymentId(providerPaymentId: string): Promise<Payment | null> {
    const entity = await this.paymentRepo.findOne({ where: { providerPaymentId } });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findByInvoiceId(invoiceId: string): Promise<Payment | null> {
    const entity = await this.paymentRepo.findOne({
      where: { invoiceId },
      order: { createdAt: 'DESC' },
    });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findByProviderOrderId(providerOrderId: string): Promise<Payment | null> {
    const entity = await this.paymentRepo.findOne({
      where: { providerOrderId },
      order: { createdAt: 'DESC' },
    });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findByUserId(userId: string, page: number, pageSize: number): Promise<Paged<Payment>> {
    const { pageNumber, pageSize: size, skip } = getPaginationValues({
      pageNumber: page,
      pageSize,
    });

    const [entities, totalCount] = await this.paymentRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip,
      take: size,
    });

    const items = entities.map((entity) => ({
      ...entity,
      amount: Number(entity.amount),
      fee: entity.fee != null ? Number(entity.fee) : null,
      tax: entity.tax != null ? Number(entity.tax) : null,
    }));

    return toPaged(Payment, {
      items,
      page: pageNumber,
      perPage: size,
      totalCount,
    });
  }

  async findBySubscriptionId(subscriptionId: string): Promise<Payment[]> {
    const entities = await this.paymentRepo.find({
      where: { subscriptionId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((entity) => this.mapEntity(entity));
  }
}
