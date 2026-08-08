import { Refund } from '../domain';

export const REFUNDS_REPOSITORY = 'REFUNDS_REPOSITORY';

export interface IRefundsRepository {
  insert(data: Refund): Promise<Refund>;
  upsertByProviderRefundId(data: Refund): Promise<Refund>;
  findByProviderRefundId(providerRefundId: string): Promise<Refund>;
  findByPaymentId(paymentId: string): Promise<Refund[]>;
  findByPaymentIds(paymentIds: string[]): Promise<Refund[]>;
}
