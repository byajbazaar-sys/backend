import { Paged } from '@shared-libs';
import { Payment } from '../domain';

export const PAYMENTS_REPOSITORY = 'PAYMENTS_REPOSITORY';

export interface IPaymentsRepository {
  insert(data: Payment): Promise<Payment>;
  upsertByProviderPaymentId(data: Payment): Promise<Payment>;
  findById(id: string): Promise<Payment>;
  findByProviderPaymentId(providerPaymentId: string): Promise<Payment>;
  findByInvoiceId(invoiceId: string): Promise<Payment>;
  findByProviderOrderId(providerOrderId: string): Promise<Payment>;
  findByUserId(userId: string, page: number, pageSize: number): Promise<Paged<Payment>>;
  findBySubscriptionId(subscriptionId: string): Promise<Payment[]>;
}
