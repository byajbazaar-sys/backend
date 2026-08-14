import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AivotService } from './aivot.service';
import { CloudflareTryOnService } from './cloudflare-try-on.service';
import { GeneratedAiImage } from '../../../application';
import { ITryOnOrchestrator } from '../../../application/shared/services/i-try-on-orchestrator.service';
import { TryOnProviderRoute } from '../../../application/shared/services/try-on-provider-route';
import type { JewelleryTryOnRequest } from '../interfaces/ai-media.types';
import { resolveTryOnProviderRoute } from '../utils/try-on-routing.util';

@Injectable()
export class TryOnOrchestratorService implements ITryOnOrchestrator {
  constructor(
    private readonly aivot: AivotService,
    private readonly cloudflare: CloudflareTryOnService,
    @InjectPinoLogger(TryOnOrchestratorService.name) private readonly logger: PinoLogger,
  ) {}

  resolveRoute(attemptNumber: number, jewelleryTypes?: string[]): TryOnProviderRoute {
    const route = resolveTryOnProviderRoute(attemptNumber, jewelleryTypes);
    this.logger.info({ attemptNumber, route }, 'Resolved try-on provider route');
    return route;
  }

  async generateTryOnImages(
    route: TryOnProviderRoute,
    request: JewelleryTryOnRequest,
    mode: 'jewellery' | 'outfit',
  ): Promise<GeneratedAiImage[]> {
    const routedRequest: JewelleryTryOnRequest = {
      ...request,
      cloudflareModel: route.cloudflareModel ?? request.cloudflareModel,
    };

    this.logger.info(
      {
        provider: route.provider,
        attemptNumber: route.attemptNumber,
        cloudflareModel: route.cloudflareModel,
        mode,
        variations: request.variations ?? 1,
        jewelleryCount: request.jewelleryItems?.length ?? 0,
      },
      'Try-on orchestrator dispatching to AI provider',
    );

    try {
      const images =
        route.provider === 'aivot'
          ? await this.aivot.generateTryOnImages(routedRequest, mode)
          : await this.cloudflare.generateTryOnImages(routedRequest, mode);

      this.logger.info(
        {
          provider: route.provider,
          attemptNumber: route.attemptNumber,
          cloudflareModel: route.cloudflareModel,
          imageCount: images.length,
        },
        'Try-on orchestrator provider succeeded',
      );
      return images;
    } catch (err) {
      const failureReason = err instanceof Error ? err.message : String(err);
      const nextRoute = resolveTryOnProviderRoute(route.attemptNumber + 1);
      this.logger.error(
        {
          provider: route.provider,
          attemptNumber: route.attemptNumber,
          cloudflareModel: route.cloudflareModel,
          failureReason,
          nextUserAttempt: route.attemptNumber + 1,
          nextProvider: nextRoute.provider,
          nextCloudflareModel: nextRoute.cloudflareModel,
        },
        'Try-on orchestrator provider failed — client retry will use next route',
      );
      throw err;
    }
  }
}
