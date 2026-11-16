import { Inject, Injectable } from '@nestjs/common';

import { IProductImageAiService, PRODUCT_IMAGE_AI_SERVICE } from '../../../application/shared';
import { GeneratedImageData, IMarketingAi } from '../../application/ports';

/** ByajBazaar's Cloudflare Workers AI setup: FLUX image-to-image / text-to-image and a cheap text model. */
@Injectable()
export class ByajBazaarAiAdapter implements IMarketingAi {
  constructor(@Inject(PRODUCT_IMAGE_AI_SERVICE) private readonly ai: IProductImageAiService) {}

  imageToImage(image: GeneratedImageData, prompt: string, size: { width: number; height: number }) {
    return this.ai.generateMarketingImage(image, prompt, size);
  }

  textToImage(prompt: string, size: { width: number; height: number }) {
    return this.ai.generateImageFromText(prompt, size);
  }

  generateText(system: string, user: string, options?: { maxTokens?: number; temperature?: number }) {
    return this.ai.generateText(system, user, options);
  }
}
