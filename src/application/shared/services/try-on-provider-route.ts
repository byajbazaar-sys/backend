import { TryOnRouteProvider } from './try-on-route-provider';

export interface TryOnProviderRoute {
  provider: TryOnRouteProvider;
  cloudflareModel?: 'klein-4b' | 'klein-9b';
  attemptNumber: number;
}
