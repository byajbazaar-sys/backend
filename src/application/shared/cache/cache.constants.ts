export const CACHE_NAMESPACE = {
  LOAN_STATS: 'loan-stats',
  INVENTORY_REPORTS: 'inventory-reports',
  USER_DETAILS: 'user-details',
} as const;

/** Default cache TTL (1 day). Version bumps invalidate immediately on writes. */
export const CACHE_TTL_SECONDS = 86_400;

export const DASHBOARD_CACHE_TTL_SECONDS = CACHE_TTL_SECONDS;

/** User profile + signed asset URLs (S3 presign is 7d; cache TTL is shorter). */
export const USER_DETAILS_CACHE_TTL_SECONDS = CACHE_TTL_SECONDS;

function cacheVersionKey(namespace: string, userId: string): string {
  return `cache:version:${namespace}:${userId}`;
}

function cacheDataKey(namespace: string, userId: string, version: string, keyParts: string[]): string {
  return `cache:data:${namespace}:${userId}:${version}:${keyParts.join(':')}`;
}

export function loanStatsCacheParts(startDate: Date, endDate: Date, itemId?: string): string[] {
  return [startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10), itemId ?? 'all'];
}

export { cacheVersionKey, cacheDataKey };
