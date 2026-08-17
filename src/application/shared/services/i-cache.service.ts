export const CACHE_SERVICE = 'ICacheService';

export interface ICacheService {
  /**
   * Returns a cached value when present; otherwise loads via `loader`, stores with TTL, and returns it.
   * Never throws — Redis failures fall back to `loader`.
   */
  getOrLoad<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>;

  /**
   * Versioned cache-aside for per-user dashboard data with many query permutations.
   * Call `bumpUserCache` on writes to invalidate all cached variants for that user.
   */
  getOrLoadVersioned<T>(
    namespace: string,
    userId: string,
    keyParts: string[],
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T>;

  /** Best-effort cache eviction; never throws. */
  invalidate(key: string): Promise<void>;

  /** Bumps a user's cache version so versioned entries are refreshed on next read. */
  bumpUserCache(namespace: string, userId: string): Promise<void>;
}
