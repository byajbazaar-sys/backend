export interface RazorpayPlanResult {
  id: string;
  amount: number;
  currency: string;
  period: string;
  interval: number;
  raw: Record<string, unknown>;
}

export interface RazorpayCustomerResult {
  id: string;
  raw: Record<string, unknown>;
}

export interface RazorpaySubscriptionResult {
  id: string;
  status: string;
  plan_id: string;
  customer_id?: string;
  short_url?: string;
  current_start?: number;
  current_end?: number;
  charge_at?: number;
  raw: Record<string, unknown>;
}

export interface RazorpayRefundResult {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: string;
  raw: Record<string, unknown>;
}

export interface RazorpayInvoiceResult {
  id: string;
  subscription_id?: string;
  order_id?: string;
  customer_id?: string;
  payment_id?: string;
  raw: Record<string, unknown>;
}

export interface RazorpayOrderResult {
  id: string;
  subscription_id?: string;
  raw: Record<string, unknown>;
}

export const RAZORPAY_SERVICE = 'RAZORPAY_SERVICE';

export interface IRazorpayService {
  ensureMonthlyPlan(amountPaise: number, currency?: string): Promise<RazorpayPlanResult>;
  createMonthlyPlan(params: {
    name: string;
    amountPaise: number;
    currency?: string;
    existingPlanId?: string;
  }): Promise<RazorpayPlanResult>;
  createOrGetCustomer(params: {
    name: string;
    email: string;
    contact?: string;
    failExisting?: boolean;
  }): Promise<RazorpayCustomerResult>;
  createSubscription(params: {
    planId: string;
    totalCount?: number;
    notes?: Record<string, string>;
    notifyInfo?: { email?: string; phone?: string };
  }): Promise<RazorpaySubscriptionResult>;
  cancelSubscription(providerSubscriptionId: string, cancelAtCycleEnd: boolean): Promise<RazorpaySubscriptionResult>;
  resumeSubscription(providerSubscriptionId: string): Promise<RazorpaySubscriptionResult>;
  pauseSubscription(providerSubscriptionId: string): Promise<RazorpaySubscriptionResult>;
  fetchSubscription(providerSubscriptionId: string): Promise<RazorpaySubscriptionResult>;
  fetchInvoice(invoiceId: string): Promise<RazorpayInvoiceResult>;
  fetchOrder(orderId: string): Promise<RazorpayOrderResult>;
  createRefund(params: {
    providerPaymentId: string;
    amountPaise?: number;
    notes?: Record<string, string>;
  }): Promise<RazorpayRefundResult>;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  getKeyId(): string;
}
