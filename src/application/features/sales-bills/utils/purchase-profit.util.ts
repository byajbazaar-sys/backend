export function computeUnitPurchaseCost(params: {
  purchaseRatePerGram?: number | null;
  netWeight?: number | null;
  makingCharges?: number | null;
  purchasePrice?: number | null;
}): number {
  const net = Number(params.netWeight) || 0;
  const rate = Number(params.purchaseRatePerGram) || 0;
  const making = Number(params.makingCharges) || 0;

  if (rate > 0 && net > 0) {
    return Math.round((rate * net + making) * 100) / 100;
  }

  const price = Number(params.purchasePrice) || 0;
  return price > 0 ? Math.round(price * 100) / 100 : 0;
}

export function computeLineProfit(
  lineTotal: number,
  unitPurchaseCost: number,
  quantity: number,
): { purchaseCost: number; profitAmount: number } {
  const qty = Math.max(1, Number(quantity) || 1);
  const purchaseCost = Math.round(unitPurchaseCost * qty * 100) / 100;
  const profitAmount = Math.round((lineTotal - purchaseCost) * 100) / 100;
  return { purchaseCost, profitAmount };
}

export function recalcLineProfitFromExisting(
  lineTotal: number,
  existingPurchaseCost: number,
  oldQuantity: number,
  newQuantity: number,
): { purchaseCost: number; profitAmount: number } {
  const oldQty = Math.max(1, Number(oldQuantity) || 1);
  const newQty = Math.max(1, Number(newQuantity) || 1);
  const unitCost = (Number(existingPurchaseCost) || 0) / oldQty;
  return computeLineProfit(lineTotal, unitCost, newQty);
}
