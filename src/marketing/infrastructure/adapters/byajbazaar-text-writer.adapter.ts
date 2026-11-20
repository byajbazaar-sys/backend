import { Inject, Injectable } from '@nestjs/common';

import { IProductImageAiService, PRODUCT_IMAGE_AI_SERVICE } from '../../../application';
import { IMarketingTextWriter } from '../../application';

/** Best free-plan Workers AI models for our languages (Nov 2026 benchmark on Hindi / Hinglish / English ad scripts). */
const PRIMARY = '@cf/google/gemma-4-26b-a4b-it';
const TEXT_FALLBACK = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const VISION_FALLBACK = '@cf/meta/llama-4-scout-17b-16e-instruct';

/**
 * Marketing copy and image-to-text through ByajBazaar's Workers AI, on the same Cloudflare account pool as try-on
 * (rotation, quota cooldowns). Gemma 4 26B for both — 10/10 valid Hindi / Hinglish scripts and the most accurate
 * jewellery description in our tests, and the cheapest; a second model takes over when it errors.
 */
@Injectable()
export class ByajBazaarTextWriterAdapter implements IMarketingTextWriter {
  constructor(@Inject(PRODUCT_IMAGE_AI_SERVICE) private readonly ai: IProductImageAiService) {}

  async write(
    system: string,
    user: string,
    options: { temperature?: number; maxTokens?: number } = {},
  ): Promise<string> {
    const settings = { temperature: options.temperature ?? 0.9, maxTokens: options.maxTokens ?? 400 };
    const model = process.env.MARKETING_SCRIPT_MODEL?.trim() || PRIMARY;
    try {
      return await this.ai.generateText(system, user, { ...settings, model });
    } catch (err) {
      if (model === TEXT_FALLBACK) throw err;
      return this.ai.generateText(system, user, { ...settings, model: TEXT_FALLBACK });
    }
  }

  async see(
    image: Buffer,
    prompt: string,
    options: { temperature?: number; maxTokens?: number } = {},
  ): Promise<string> {
    const settings = { temperature: options.temperature ?? 0.2, maxTokens: options.maxTokens ?? 300 };
    const model = process.env.MARKETING_VISION_MODEL?.trim() || PRIMARY;
    try {
      return await this.ai.describeImage(image, prompt, { ...settings, model });
    } catch (err) {
      if (model === VISION_FALLBACK) throw err;
      return this.ai.describeImage(image, prompt, { ...settings, model: VISION_FALLBACK });
    }
  }
}
