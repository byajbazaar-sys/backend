import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { MarketingRenderService } from '../../../marketing';
import { AiVoiceGpuStatus, IAiVoiceGpu } from '../../application';

/**
 * The assistant's Hindi voice runs on marketing's warm Kaggle workers (their voice lane). Starting one goes through
 * marketing's own dispatch rules (free slot, GPU hours, resting accounts) — MarketingRenderService.warmForAssistant.
 * Looked up when needed, so the AI module does not import the marketing module (no load-order coupling).
 */
@Injectable()
export class ByajBazaarVoiceGpuAdapter implements IAiVoiceGpu {
  constructor(
    private readonly moduleRef: ModuleRef,
    @InjectPinoLogger(ByajBazaarVoiceGpuAdapter.name) private readonly logger: PinoLogger,
  ) {}

  async warm(): Promise<'warm' | 'starting' | 'unavailable'> {
    const render = this.render();
    if (!render) return 'unavailable';
    try {
      return await render.warmForAssistant();
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'Could not warm a GPU worker for the assistant voice');
      return 'unavailable';
    }
  }

  async status(): Promise<AiVoiceGpuStatus> {
    const render = this.render();
    if (!render) return { state: 'unavailable', since: null, reason: 'the marketing GPU pool is not loaded' };
    return render.assistantVoiceStatus();
  }

  private render(): MarketingRenderService | null {
    try {
      return this.moduleRef.get(MarketingRenderService, { strict: false });
    } catch {
      this.logger.warn('The marketing GPU pool is not available to the assistant voice');
      return null;
    }
  }
}
