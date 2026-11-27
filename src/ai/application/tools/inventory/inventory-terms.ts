/** Inventory values the assistant understands, matching ByajBazaar's inventory enums. */
export const METAL_TYPES = ['GOLD', 'SILVER', 'PLATINUM', 'DIAMOND', 'OTHER'] as const;
export const ITEM_STATUSES = ['AVAILABLE', 'SOLD', 'RESERVED', 'DAMAGED', 'IN_REPAIR'] as const;
export const MAKING_CHARGE_MODES = ['FIXED', 'PERCENT', 'PER_PC', 'PER_GRAM'] as const;

/** Metals where a purity (karat / tunch) is expected on every item. */
export const METALS_WITH_PURITY = new Set(['GOLD', 'SILVER', 'PLATINUM']);

/** Most a single jewellery item can sensibly weigh, in grams (catches unit mix-ups: 5 kg typed as 5000 g is fine). */
export const MAX_ITEM_WEIGHT_GRAMS = 50_000;

/**
 * "22k", "22 carat", "22kt" → "22K"; "70 %", "70 tunch" → "70%"; "916", "92.5", "999" stay as they are.
 * Anything else is kept as typed (trimmed), since shops write purity their own way.
 */
export function normalizePurity(raw: string | undefined | null): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const karat = /^(\d{1,2})\s*(k|kt|karat|carat|ct)$/i.exec(value);
  if (karat) return `${Number(karat[1])}K`;
  const percent = /^(\d{1,3}(?:\.\d{1,2})?)\s*(%|percent|tunch|tanch)$/i.exec(value);
  if (percent) return `${Number(percent[1])}%`;
  return value.slice(0, 20);
}

/** "payal" → "Payal", "gold ring" → "Gold Ring" (Hindi and other scripts are left as typed). */
export function titleCase(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Grams rounded to 3 decimals (milligram precision). */
export const roundGrams = (value: number): number => Math.round(value * 1000) / 1000;
