import { EMetalType } from '../inventory/enums';

export const GOLD_RATE_PURITIES = ['24K', '22K', '20K', '18K', '14K'] as const;
export const SILVER_RATE_PURITIES = ['999', '925'] as const;

export const CURRENT_RATE_KEYS = ['gold24', 'gold22', 'gold20', 'gold18', 'silver999', 'silver925'] as const;

export type CurrentRateKey = (typeof CURRENT_RATE_KEYS)[number];

const PURITY_TO_KEY: Record<string, CurrentRateKey> = {
  '24K': 'gold24',
  '22K': 'gold22',
  '20K': 'gold20',
  '18K': 'gold18',
  '999': 'silver999',
  '925': 'silver925',
};

export function purityToCurrentKey(metalType: EMetalType, purity: string): CurrentRateKey {
  const normalized = purity.trim().toUpperCase();
  const key = PURITY_TO_KEY[normalized];
  if (!key) return null;
  if (metalType === EMetalType.Gold && key.startsWith('gold')) return key;
  if (metalType === EMetalType.Silver && key.startsWith('silver')) return key;
  return null;
}

export function isAllowedRatePurity(metalType: EMetalType, purity: string): boolean {
  const normalized = purity.trim().toUpperCase();
  if (metalType === EMetalType.Gold) {
    return (GOLD_RATE_PURITIES as readonly string[]).includes(normalized);
  }
  if (metalType === EMetalType.Silver) {
    return (SILVER_RATE_PURITIES as readonly string[]).includes(normalized);
  }
  return false;
}

import { CACHE_TTL_SECONDS } from '../../shared';

/** Current rates cache TTL; invalidated immediately on write. */
export const METAL_RATE_CURRENT_CACHE_TTL_SECONDS = CACHE_TTL_SECONDS;

export function metalRateCurrentCacheKey(userId: string): string {
  return `metal-rates:current:${userId}`;
}
