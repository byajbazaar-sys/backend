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
