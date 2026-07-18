import type { JewelleryTryOnRequest } from '../../features/try-on/types';
import type { GeneratedAiImage } from '../interfaces';

export const TRY_ON_ORCHESTRATOR = 'TRY_ON_ORCHESTRATOR';

export type TryOnRouteProvider = 'aivot' | 'cloudflare';

export interface TryOnProviderRoute {
  provider: TryOnRouteProvider;
  cloudflareModel?: 'klein-4b' | 'klein-9b';
  attemptNumber: number;
}

export interface ITryOnOrchestrator {
  resolveRoute(attemptNumber: number): TryOnProviderRoute;
  generateTryOnImages(
    route: TryOnProviderRoute,
    request: JewelleryTryOnRequest,
    mode: 'jewellery' | 'outfit',
  ): Promise<GeneratedAiImage[]>;
}
