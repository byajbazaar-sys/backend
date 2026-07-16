import { PaymentEvent } from '../domain';

export const PAYMENT_EVENTS_REPOSITORY = 'PAYMENT_EVENTS_REPOSITORY';

export interface IPaymentEventsRepository {
  insert(data: PaymentEvent): Promise<PaymentEvent>;
  insertOrGet(data: PaymentEvent): Promise<{ event: PaymentEvent; created: boolean }>;
  findByProviderAndEventId(provider: string, eventId: string): Promise<PaymentEvent | null>;
  markProcessed(id: string): Promise<PaymentEvent>;
  updateLinks(
    id: string,
    data: {
      userId?: string | null;
      paymentId?: string | null;
      paymentOrderId?: string | null;
    },
  ): Promise<PaymentEvent>;
  findByProviderSubscriptionId(providerSubscriptionId: string, limit?: number): Promise<PaymentEvent[]>;
  findUnlinkedByProviderPaymentId(providerPaymentId: string): Promise<PaymentEvent[]>;
}
