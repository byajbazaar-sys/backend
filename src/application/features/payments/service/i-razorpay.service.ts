import {
  RazorpayCreateMonthlyPlanData,
  RazorpayCreateCustomerData,
  RazorpayCreateSubscriptionData,
  RazorpayCreateRefundData,
} from '../domain';
import { RazorpayPlanResult } from './razorpay-plan-result';
import { RazorpayCustomerResult } from './razorpay-customer-result';
import { RazorpaySubscriptionResult } from './razorpay-subscription-result';
import { RazorpayRefundResult } from './razorpay-refund-result';
import { RazorpayInvoiceResult } from './razorpay-invoice-result';
import { RazorpayOrderResult } from './razorpay-order-result';

export const RAZORPAY_SERVICE = 'RAZORPAY_SERVICE';

export interface IRazorpayService {
  ensureMonthlyPlan(amountPaise: number, currency?: string): Promise<RazorpayPlanResult>;
  createMonthlyPlan(params: RazorpayCreateMonthlyPlanData): Promise<RazorpayPlanResult>;
  createOrGetCustomer(params: RazorpayCreateCustomerData): Promise<RazorpayCustomerResult>;
  createSubscription(params: RazorpayCreateSubscriptionData): Promise<RazorpaySubscriptionResult>;
  cancelSubscription(providerSubscriptionId: string, cancelAtCycleEnd: boolean): Promise<RazorpaySubscriptionResult>;
  resumeSubscription(providerSubscriptionId: string): Promise<RazorpaySubscriptionResult>;
  pauseSubscription(providerSubscriptionId: string): Promise<RazorpaySubscriptionResult>;
  fetchSubscription(providerSubscriptionId: string): Promise<RazorpaySubscriptionResult>;
  fetchInvoice(invoiceId: string): Promise<RazorpayInvoiceResult>;
  fetchOrder(orderId: string): Promise<RazorpayOrderResult>;
  createRefund(params: RazorpayCreateRefundData): Promise<RazorpayRefundResult>;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  getKeyId(): string;
}
