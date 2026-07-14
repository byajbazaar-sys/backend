import { Paged } from '@shared-libs';
import { Payment } from '../domain';

export const PAYMENTS_REPOSITORY = 'PAYMENTS_REPOSITORY';

export interface IPaymentsRepository {
  insert(data: Payment): Promise<Payment>;
  upsertByProviderPaymentId(data: Payment): Promise<Payment>;
  findById(id: string): Promise<Payment | null>;
  findByProviderPaymentId(providerPaymentId: string): Promise<Payment | null>;
  findByInvoiceId(invoiceId: string): Promise<Payment | null>;
  findByProviderOrderId(providerOrderId: string): Promise<Payment | null>;
  findByUserId(userId: string, page: number, pageSize: number): Promise<Paged<Payment>>;
  findBySubscriptionId(subscriptionId: string): Promise<Payment[]>;
}
