export interface UpsertRefundEntityInput {
  paymentId: string;
  amount: number;
  status: string;
  reason: string | null;
  rawJson: Record<string, unknown>;
}
