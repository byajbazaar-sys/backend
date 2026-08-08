const STOP_WORDS = new Set(['the', 'and', 'of', 'a', 'an', '&']);

/** Derive SKU prefix from business name, e.g. "Shree R K Jewellers" → "SRKJ". */
export function deriveBusinessSkuPrefix(businessName: string): string {
  const trimmed = businessName?.trim() ?? '';
  if (!trimmed) return 'RK';

  const initials = trimmed
    .split(/\s+/)
    .map((token) => token.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token.toLowerCase()))
    .map((token) => token[0]!.toUpperCase())
    .join('');

  if (initials.length >= 2) return initials.slice(0, 8);

  const alnum = trimmed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (alnum.length >= 2) return alnum.slice(0, 4);

  return 'RK';
}
