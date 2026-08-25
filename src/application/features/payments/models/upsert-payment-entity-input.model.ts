export interface UpsertPaymentEntityInput {
  userId: string;
  subscriptionId: string | null;
  providerOrderId: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  bank: string | null;
  wallet: string | null;
  upi: string | null;
  fee: number | null;
  tax: number | null;
  capturedAt: Date | null;
  invoiceId: string | null;
  rawJson: Record<string, unknown>;
}
