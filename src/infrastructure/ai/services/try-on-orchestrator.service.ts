import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { GeneratedAiImage } from '../../../application';
import {
  ITryOnOrchestrator,
  TryOnProviderRoute,
} from '../../../application/shared/services/i-try-on-orchestrator.service';
import type { JewelleryTryOnRequest } from '../interfaces/ai-media.types';
import { resolveTryOnProviderRoute } from '../utils/try-on-routing.util';
import { AivotService } from './aivot.service';
import { CloudflareTryOnService } from './cloudflare-try-on.service';

@Injectable()
export class TryOnOrchestratorService implements ITryOnOrchestrator {
  constructor(
    private readonly aivot: AivotService,
    private readonly cloudflare: CloudflareTryOnService,
    @InjectPinoLogger(TryOnOrchestratorService.name) private readonly logger: PinoLogger,
  ) {}

  resolveRoute(attemptNumber: number): TryOnProviderRoute {
    const route = resolveTryOnProviderRoute(attemptNumber);
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

    if (route.provider === 'aivot') {
      return this.aivot.generateTryOnImages(routedRequest, mode);
    }

    return this.cloudflare.generateTryOnImages(routedRequest, mode);
  }
}
