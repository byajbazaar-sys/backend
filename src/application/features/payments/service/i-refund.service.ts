import { Payment, Refund } from '../domain';

export const REFUND_SERVICE = 'REFUND_SERVICE';

export interface IRefundService {
  recordRefund(payment: Payment, refund: Refund): Promise<Refund>;
  syncPaymentAfterRefund(payment: Payment): Promise<void>;
  buildRefundFromWebhook(payment: Payment, entity: Record<string, unknown>): Refund;
}
