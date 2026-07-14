import { PaymentOrder } from '../domain';

export const PAYMENT_ORDERS_REPOSITORY = 'PAYMENT_ORDERS_REPOSITORY';

export interface IPaymentOrdersRepository {
  insert(data: PaymentOrder): Promise<PaymentOrder>;
  findByProviderOrderId(providerOrderId: string): Promise<PaymentOrder | null>;
  findBySubscriptionId(subscriptionId: string): Promise<PaymentOrder[]>;
}
