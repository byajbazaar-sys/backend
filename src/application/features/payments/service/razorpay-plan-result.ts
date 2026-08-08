export interface RazorpayPlanResult {
  id: string;
  amount: number;
  currency: string;
  period: string;
  interval: number;
  raw: Record<string, unknown>;
}
