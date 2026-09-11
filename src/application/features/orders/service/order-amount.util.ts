export function getEffectiveOrderAmount(order: {
  finalAmount?: number | null;
  estimatedAmount?: number | null;
  totalAmount?: number | null;
}): number {
  const finalAmount = order.finalAmount != null ? Number(order.finalAmount) : null;
  const estimatedAmount = order.estimatedAmount != null ? Number(order.estimatedAmount) : null;
  const totalAmount = order.totalAmount != null ? Number(order.totalAmount) : null;
  return finalAmount ?? estimatedAmount ?? totalAmount ?? 0;
}

export function syncLegacyTotalAmount(estimatedAmount: number, finalAmount?: number | null): number {
  return finalAmount != null ? Number(finalAmount) : Number(estimatedAmount);
}
