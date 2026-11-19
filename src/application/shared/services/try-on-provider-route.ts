import { TryOnRouteProvider } from './try-on-route-provider';

export interface TryOnProviderRoute {
  provider: TryOnRouteProvider;
  /** Always FLUX.2 [klein] 9B (4B was removed). */
  cloudflareModel?: 'klein-9b';
  attemptNumber: number;
}
