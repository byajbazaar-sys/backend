import type { JewelleryTryOnRequest } from '../../features/try-on/interfaces';
import type { GeneratedAiImage } from '../interfaces';
import { TryOnProviderRoute } from './try-on-provider-route';

export const TRY_ON_ORCHESTRATOR = 'TRY_ON_ORCHESTRATOR';

export interface ITryOnOrchestrator {
  resolveRoute(attemptNumber: number, jewelleryTypes?: string[]): TryOnProviderRoute;
  generateTryOnImages(
    route: TryOnProviderRoute,
    request: JewelleryTryOnRequest,
    mode: 'jewellery' | 'outfit',
  ): Promise<GeneratedAiImage[]>;
}
