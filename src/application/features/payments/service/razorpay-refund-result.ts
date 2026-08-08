export interface RazorpayRefundResult {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: string;
  raw: Record<string, unknown>;
}
