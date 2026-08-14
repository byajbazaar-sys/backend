import { Refund } from '../domain';

const REFUNDABLE_PAYMENT_STATUSES = new Set(['captured', 'partially_refunded']);

export function isPaymentRefundable(status: string): boolean {
  return REFUNDABLE_PAYMENT_STATUSES.has(status);
}

export function sumRefundedAmount(refunds: Refund[], statuses: string[] = ['processed']): number {
  return refunds.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + Number(r.amount), 0);
}

export function remainingRefundableAmount(paymentAmount: number, refunds: Refund[]): number {
  const processed = sumRefundedAmount(refunds, ['processed']);
  const pending = sumRefundedAmount(refunds, ['pending']);
  return Math.max(0, Number(paymentAmount) - processed - pending);
}

export function isFullyRefunded(paymentAmount: number, refunds: Refund[]): boolean {
  return sumRefundedAmount(refunds, ['processed']) >= Number(paymentAmount) - 0.01;
}

export function parseRefundReason(notes: unknown): string {
  if (!notes) return null;
  if (typeof notes === 'string') return notes;
  if (typeof notes === 'object' && !Array.isArray(notes)) {
    const record = notes as Record<string, string>;
    return record.reason ?? null;
  }
  return null;
}

export function resolvePaymentStatusAfterRefund(
  paymentAmount: number,
  refunds: Refund[],
  currentStatus: string,
): string {
  if (isFullyRefunded(paymentAmount, refunds)) {
    return 'refunded';
  }

  const activeRefundTotal = sumRefundedAmount(refunds, ['processed', 'pending']);
  if (activeRefundTotal > 0) {
    if (currentStatus === 'captured' || currentStatus === 'partially_refunded' || currentStatus === 'refunded') {
      return 'partially_refunded';
    }
    return currentStatus;
  }

  if (currentStatus === 'partially_refunded' || currentStatus === 'refunded') {
    return 'captured';
  }

  return currentStatus;
}
