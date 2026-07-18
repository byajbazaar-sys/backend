import type { TryOnProviderRoute } from '../../../application/shared/services/i-try-on-orchestrator.service';

/** Per-user try-on attempt → provider/model (1-based). */
export function resolveTryOnProviderRoute(attemptNumber: number): TryOnProviderRoute {
  const attempt = Math.max(1, Math.floor(attemptNumber));

  if (attempt === 1 || attempt === 5) {
    return { provider: 'aivot', attemptNumber: attempt };
  }
  if (attempt === 2 || attempt === 4) {
    return { provider: 'cloudflare', cloudflareModel: 'klein-4b', attemptNumber: attempt };
  }
  if (attempt === 3) {
    return { provider: 'cloudflare', cloudflareModel: 'klein-9b', attemptNumber: attempt };
  }
  return { provider: 'cloudflare', cloudflareModel: 'klein-4b', attemptNumber: attempt };
}
