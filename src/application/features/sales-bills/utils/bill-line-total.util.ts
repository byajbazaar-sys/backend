import { EQuantityPricingMode } from '../enums/e-quantity-pricing-mode.enum';

export function normalizeQuantityPricingMode(
  mode?: string | null,
): EQuantityPricingMode {
  return mode === EQuantityPricingMode.Fixed
    ? EQuantityPricingMode.Fixed
    : EQuantityPricingMode.Multiply;
}

export function computeBillLineTotal(
  sellingPrice: number,
  quantity: number,
  mode?: string | null,
): number {
  const price = Number(sellingPrice) || 0;
  const qty = Math.max(1, Number(quantity) || 1);
  if (normalizeQuantityPricingMode(mode) === EQuantityPricingMode.Fixed) {
    return Math.round(price * 100) / 100;
  }
  return Math.round(price * qty * 100) / 100;
}
