import { randomInt } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Replicate from 'replicate';
import {
  REPLICATE_TRYON_MIME,
} from '../ai.constants';
import type {
  AiImageInput,
  JewelleryTryOnRequest,
  OutfitRecolorRequest,
} from '../interfaces/ai-media.types';
import {
  buildFullTryOnPrompt,
} from '../prompts/try-on.prompts';
import { buildTryOnImageSequence } from '../utils/try-on-images.util';
import { ReplicateTryOnOptions } from '../replicate-try-on.options';
import { stripDataUrl, withTimeout } from '../utils/image.util';
import { BedrockService } from './bedrock.service';
import { GeneratedAiImage, ITryOnAiService } from '../../../application';

type ReplicateFileOutput = {
  url?: () => URL;
};

@Injectable()
export class ReplicateTryOnService implements ITryOnAiService {
  private readonly client: Replicate | null;

  constructor(
    private readonly options: ReplicateTryOnOptions,
    private readonly bedrock: BedrockService,
    @InjectPinoLogger(ReplicateTryOnService.name) private readonly logger: PinoLogger,
  ) {
    this.client = this.options.isConfigured
      ? new Replicate({ auth: this.options.apiToken.trim() })
      : null;
  }

  async generateJewelleryTryOn(request: JewelleryTryOnRequest): Promise<GeneratedAiImage> {
    return (await this.generateTryOnImages(request, 'jewellery'))[0];
  }

  async generateOutfitTryOn(request: JewelleryTryOnRequest): Promise<GeneratedAiImage> {
    return (await this.generateTryOnImages(request, 'outfit'))[0];
  }

  async generateTryOnImages(
    request: JewelleryTryOnRequest,
    mode: 'jewellery' | 'outfit',
  ): Promise<GeneratedAiImage[]> {
    this.assertConfigured();
    const count = Math.min(2, Math.max(1, request.variations ?? 2));
    const images: GeneratedAiImage[] = [];

    for (let i = 0; i < count; i++) {
      const seed = i === 0 ? undefined : randomInt(1, 2_147_483_647);
      images.push(await this.runOnce(request, mode, seed));
    }

    return images;
  }

  async recolorOutfit(request: OutfitRecolorRequest): Promise<GeneratedAiImage> {
    return this.bedrock.recolorOutfit(request);
  }

  private assertConfigured(): void {
    if (!this.client) {
      throw new BadRequestException(
        'Try-on AI provider is not configured (REPLICATE_API_TOKEN is missing)',
      );
    }
  }

  private buildPrompt(request: JewelleryTryOnRequest, mode: 'jewellery' | 'outfit'): string {
    return buildFullTryOnPrompt(mode, request);
  }

  private buildInputImages(request: JewelleryTryOnRequest): string[] {
    if (!request.personImage?.base64) {
      throw new BadRequestException('personImage is required');
    }

    const items = request.jewelleryItems ?? [];
    if (!items.length) {
      throw new BadRequestException('At least one jewellery item is required');
    }

    return buildTryOnImageSequence(request.personImage, items).map((image) => this.toDataUri(image));
  }

  private toDataUri(image: AiImageInput): string {
    const base64 = stripDataUrl(image.base64);
    const mime = image.mimeType || REPLICATE_TRYON_MIME;
    return `data:${mime};base64,${base64}`;
  }

  private async runOnce(
    request: JewelleryTryOnRequest,
    mode: 'jewellery' | 'outfit',
    seed?: number,
  ): Promise<GeneratedAiImage> {
    const prompt = this.buildPrompt(request, mode);
    const inputImages = this.buildInputImages(request);
    const maxAttempts = Math.max(1, this.options.maxRetries + 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = Date.now();
      try {
        const output = await withTimeout(
          this.client!.run(this.options.modelId as `${string}/${string}`, {
            input: {
              prompt,
              input_images: inputImages,
              aspect_ratio: 'match_input_image',
              resolution: '2 MP',
              output_format: 'jpg',
              output_quality: 95,
              safety_tolerance: 2,
              prompt_upsampling: false,
              ...(seed != null ? { seed } : {}),
            },
          }),
          this.options.timeoutMs,
          this.options.modelId,
        );

        const image = await this.normalizeOutput(output);
        this.logger.info(
          {
            model: this.options.modelId,
            attempt,
            durationMs: Date.now() - started,
            jewelleryCount: request.jewelleryItems.length,
          },
          'Replicate try-on completed',
        );
        return image;
      } catch (err) {
        lastError = err;
        this.logger.warn({ err, attempt, model: this.options.modelId }, 'Replicate try-on attempt failed');
        if (attempt < maxAttempts) {
          await this.delay(1_500 * attempt);
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new BadRequestException('Replicate try-on request failed');
  }

  private async normalizeOutput(output: unknown): Promise<GeneratedAiImage> {
    const url = this.resolveOutputUrl(output);
    if (!url) {
      throw new BadRequestException('Replicate returned no image output');
    }

    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: this.options.timeoutMs,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const contentType = String(response.headers['content-type'] || REPLICATE_TRYON_MIME);
    const mimeType = contentType.split(';')[0].trim() || REPLICATE_TRYON_MIME;
    const base64 = Buffer.from(response.data).toString('base64');
    return { base64, mimeType };
  }

  private resolveOutputUrl(output: unknown): string | null {
    if (!output) return null;

    if (Array.isArray(output)) {
      for (const item of output) {
        const url = this.resolveOutputUrl(item);
        if (url) return url;
      }
      return null;
    }

    if (typeof output === 'string') {
      return output;
    }

    const fileOutput = output as ReplicateFileOutput;
    if (typeof fileOutput.url === 'function') {
      return fileOutput.url().toString();
    }

    return null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
