import { PaymentEvent, PaymentEventInsertResult, PaymentEventLinksData } from '../domain';

export const PAYMENT_EVENTS_REPOSITORY = 'PAYMENT_EVENTS_REPOSITORY';

export interface IPaymentEventsRepository {
  insert(data: PaymentEvent): Promise<PaymentEvent>;
  insertOrGet(data: PaymentEvent): Promise<PaymentEventInsertResult>;
  findByProviderAndEventId(provider: string, eventId: string): Promise<PaymentEvent>;
  markProcessed(id: string): Promise<PaymentEvent>;
  updateLinks(id: string, data: PaymentEventLinksData): Promise<PaymentEvent>;
  findByProviderSubscriptionId(providerSubscriptionId: string, limit?: number): Promise<PaymentEvent[]>;
  findUnlinkedByProviderPaymentId(providerPaymentId: string): Promise<PaymentEvent[]>;
}
