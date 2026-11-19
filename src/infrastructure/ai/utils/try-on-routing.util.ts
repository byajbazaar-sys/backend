import { requiresCloudflareOnly, type TryOnProviderRoute } from '../../../application';

/**
 * Per-user try-on attempt → provider (1-based). Every Cloudflare attempt uses FLUX.2 [klein] 9B; Cloudflare-only
 * jewellery types never go to Aivot.
 */
export function resolveTryOnProviderRoute(attemptNumber: number, jewelleryTypes?: string[]): TryOnProviderRoute {
  const attempt = Math.max(1, Math.floor(attemptNumber));
  const cloudflare: TryOnProviderRoute = {
    provider: 'cloudflare',
    cloudflareModel: 'klein-9b',
    attemptNumber: attempt,
  };

  if (jewelleryTypes?.length && requiresCloudflareOnly(jewelleryTypes)) {
    return cloudflare;
  }
  if (attempt === 1 || attempt === 5) {
    return { provider: 'aivot', attemptNumber: attempt };
  }
  return cloudflare;
}
