export interface RazorpayInvoiceResult {
  id: string;
  subscription_id?: string;
  order_id?: string;
  customer_id?: string;
  payment_id?: string;
  raw: Record<string, unknown>;
}
