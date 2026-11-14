import { BadRequestException, Injectable } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { randomInt } from 'crypto';
import FormData from 'form-data';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import sharp from 'sharp';

import { GeneratedAiImage, IProductImageAiService, ITryOnAiService, ProductImageInput } from '../../../application';
import {
  CLOUDFLARE_TRYON_MAX_IMAGE_PX,
  CLOUDFLARE_TRYON_MIME,
  CLOUDFLARE_TRYON_MODEL_FAST,
  resolveCloudflareTryOnModelId,
} from '../ai.constants';
import { CloudflareTryOnOptions, type CloudflareCredential } from '../cloudflare-try-on.options';
import type { AiImageInput, JewelleryTryOnRequest, OutfitRecolorRequest } from '../interfaces/ai-media.types';
import { buildProductBackgroundRemovalPrompt } from '../prompts/product-image.prompts';
import { buildFullTryOnPrompt, buildOutfitRecolorPrompt } from '../prompts/try-on.prompts';
import { detectDisplayBackdrop, displayBackdropCutout } from '../utils/display-backdrop.util';
import { stripDataUrl, toGeneratedImage, withTimeout } from '../utils/image.util';
import {
  type ProductCutout,
  type RefineOptions,
  compressPngForApiPreview,
  encodeTransparentCutoutPng,
  encodeWhitePreviewPng,
  extractTransparentCutout,
  hasGeneratedWhiteBackdrop,
  hasWhiteStudioBackground,
  prepareProductModelInput,
  refineProductCutout,
  removeWhiteBackground,
  whiteBackdropCutout,
} from '../utils/product-image.util';
import { buildTryOnImageSequence } from '../utils/try-on-images.util';

type ProductCutoutPurpose = 'white preview' | 'transparent storage';

/** Keyed foreground above this share means a prop (bust, stand, packaging) is still in the picture. */
const WHITE_KEY_MAX_FOREGROUND = 0.25;
/** Near-black share of the model's foreground at which the output is a line-art sketch (or a kept dark prop). */
const SKETCH_DARK_FRACTION = 0.08;

interface CloudflareRunResponse {
  success?: boolean;
  result?: {
    image?: string;
    description?: string;
  };
  errors?: { message?: string }[];
}

@Injectable()
export class CloudflareTryOnService implements ITryOnAiService, IProductImageAiService {
  private keyPointer = 0;

  constructor(
    private readonly options: CloudflareTryOnOptions,
    @InjectPinoLogger(CloudflareTryOnService.name) private readonly logger: PinoLogger,
  ) {}

  async generateJewelleryTryOn(request: JewelleryTryOnRequest): Promise<GeneratedAiImage> {
    return (await this.generateTryOnImages(request, 'jewellery'))[0];
  }

  async generateOutfitTryOn(request: JewelleryTryOnRequest): Promise<GeneratedAiImage> {
    return (await this.generateTryOnImages(request, 'outfit'))[0];
  }

  async generateTryOnImages(request: JewelleryTryOnRequest, mode: 'jewellery' | 'outfit'): Promise<GeneratedAiImage[]> {
    this.assertConfigured();
    const count = Math.min(2, Math.max(1, request.variations ?? 2));
    const modelId = this.resolveModelId(request);
    this.logger.info(
      {
        provider: 'cloudflare',
        model: modelId,
        mode,
        variations: count,
        credentialCount: this.options.credentials.length,
        timeoutMs: this.options.timeoutMs,
        maxRetries: this.options.maxRetries,
      },
      'Cloudflare try-on processing started',
    );
    const images: GeneratedAiImage[] = [];

    for (let i = 0; i < count; i++) {
      const seed = i === 0 ? undefined : randomInt(1, 2_147_483_647);
      images.push(await this.runOnce(request, mode, seed, i + 1, count));
    }

    return images;
  }

  async recolorOutfit(request: OutfitRecolorRequest): Promise<GeneratedAiImage> {
    this.assertConfigured();
    const prompt = buildOutfitRecolorPrompt(request.color);
    const inputImage = await this.resizeForCloudflare(request.image);
    const modelId = resolveCloudflareTryOnModelId(undefined, this.options.modelId);
    const credentialCount = this.options.credentials.length;
    const maxAttempts = credentialCount * Math.max(1, this.options.maxRetries + 1);
    let lastError: unknown;

    this.logger.info(
      { provider: 'cloudflare', model: modelId, color: request.color, credentialCount },
      'Cloudflare outfit recolor started',
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const credential = this.getCredential();
      const started = Date.now();
      try {
        const image = await withTimeout(
          this.invokeWorkersAi(prompt, [inputImage], credential, modelId),
          this.options.timeoutMs,
          modelId,
        );
        this.logger.info(
          {
            provider: 'cloudflare',
            model: modelId,
            attempt,
            accountId: credential.accountId,
            durationMs: Date.now() - started,
          },
          'Cloudflare outfit recolor completed',
        );
        return image;
      } catch (err) {
        lastError = err;
        const status = err instanceof AxiosError ? err.response?.status : (err as Error & { status?: number }).status;
        const willRotate = this.shouldRotateToken(err, status);
        this.logger.warn(
          {
            provider: 'cloudflare',
            model: modelId,
            attempt,
            maxAttempts,
            status,
            accountId: credential.accountId,
            failureReason: this.errorMessage(err),
          },
          'Cloudflare outfit recolor attempt failed',
        );
        if (willRotate) {
          this.rotateApiToken();
        }
        if (attempt < maxAttempts) {
          await this.delay(1_500 * attempt);
        }
      }
    }

    throw this.toTryOnException(lastError, (lastError as Error & { status?: number })?.status);
  }

  async removeProductBackground(image: ProductImageInput): Promise<GeneratedAiImage> {
    const cutout = await this.resolveProductCutout(image, 'white preview');
    const png = await encodeWhitePreviewPng(cutout);
    return { base64: png.toString('base64'), mimeType: 'image/png' };
  }

  async stripWhiteBackground(image: ProductImageInput): Promise<GeneratedAiImage> {
    const input = Buffer.from(stripDataUrl(image.base64), 'base64');
    const cutout = await removeWhiteBackground(input);
    return { base64: cutout.toString('base64'), mimeType: 'image/png' };
  }

  async prepareTryOnStorageImage(image: ProductImageInput): Promise<GeneratedAiImage> {
    const input = Buffer.from(stripDataUrl(image.base64), 'base64');
    // The client sends back the preview it chose; a transparent one is already the cutout.
    const existingCutout = await extractTransparentCutout(input);
    if (existingCutout) {
      return { base64: existingCutout.toString('base64'), mimeType: 'image/png' };
    }
    const cutout = await this.resolveProductCutout(image, 'transparent storage');
    const png = await encodeTransparentCutoutPng(cutout);
    return { base64: png.toString('base64'), mimeType: 'image/png' };
  }

  /**
   * Picks the cheapest reliable route:
   * - a photo on a dark/grey display tray is keyed from the photo itself (see {@link tryDisplayTrayCutout});
   * - a photo already on white is keyed without the model (FLUX tends to hand such photos back as a line-art
   *   sketch), unless the key leaves a large prop (bust, stand, packaging) — then the model runs with the keyed
   *   image as the fallback should it sketch;
   * - transparent uploads (earlier cutouts being regenerated) and photos on other backdrops go to the model.
   */
  private async resolveProductCutout(image: ProductImageInput, purpose: ProductCutoutPurpose): Promise<ProductCutout> {
    const input = Buffer.from(stripDataUrl(image.base64), 'base64');
    const meta = await sharp(input).metadata();
    if (meta.hasAlpha) {
      return this.runProductBackgroundRemoval(image, purpose, { whiteIsForeign: true });
    }
    const trayCutout = await this.tryDisplayTrayCutout(input, purpose);
    if (trayCutout) {
      return trayCutout;
    }
    if (!(await hasWhiteStudioBackground(input))) {
      return this.runProductBackgroundRemoval(image, purpose, {});
    }
    // A preview this pipeline already produced (exact #FFFFFF backdrop) is only re-keyed: running it through the
    // model again risks it coming back redrawn, and there is no backdrop left to remove.
    if (await hasGeneratedWhiteBackdrop(input)) {
      return whiteBackdropCutout(input);
    }

    let keyed: ProductCutout | null = null;
    try {
      keyed = await whiteBackdropCutout(input);
    } catch (err) {
      this.logger.warn({ err, purpose }, 'White key found no product; using the model');
    }
    if (keyed && keyed.stats.foregroundRatio <= WHITE_KEY_MAX_FOREGROUND) {
      this.logger.info(
        { provider: 'cloudflare', purpose, size: `${keyed.width}x${keyed.height}`, ...keyed.stats },
        'Product background removed by white key (model skipped)',
      );
      return keyed;
    }

    try {
      const generated = await this.runProductBackgroundRemoval(image, purpose, { whiteIsForeign: !!keyed });
      if (keyed && generated.stats.darkFraction >= SKETCH_DARK_FRACTION) {
        this.logger.warn(
          { provider: 'cloudflare', purpose, darkFraction: generated.stats.darkFraction },
          'Model output looks like a sketch or kept a dark prop; using the white-keyed photo instead',
        );
        return keyed;
      }
      return generated;
    } catch (err) {
      if (!keyed) throw err;
      this.logger.warn({ err, purpose }, 'Model failed; using the white-keyed photo instead');
      return keyed;
    }
  }

  /**
   * Jewellery on a dark/grey display tray is keyed straight from the photo: the model repaints onto white and the
   * white-based refinement then erases silver, which is near-white itself. Returns null (use the usual route) when
   * the photo is not on a tray or the key does not give a plausible cutout.
   */
  private async tryDisplayTrayCutout(input: Buffer, purpose: ProductCutoutPurpose): Promise<ProductCutout | null> {
    try {
      const backdrop = await detectDisplayBackdrop(input);
      if (!backdrop) return null;
      const started = Date.now();
      const cutout = await displayBackdropCutout(input, backdrop);
      this.logger.info(
        {
          provider: 'cloudflare',
          purpose,
          size: `${cutout.width}x${cutout.height}`,
          backdrop: backdrop.color,
          durationMs: Date.now() - started,
          ...cutout.stats,
        },
        'Product background removed by display-tray key (model skipped)',
      );
      return cutout;
    } catch (err) {
      this.logger.warn({ err, purpose }, 'Display-tray key not usable; using the usual route');
      return null;
    }
  }

  async compressPngForPreview(image: ProductImageInput): Promise<GeneratedAiImage> {
    const input = Buffer.from(stripDataUrl(image.base64), 'base64');
    const compressed = await compressPngForApiPreview(input);
    return { base64: compressed.toString('base64'), mimeType: 'image/png' };
  }

  private async runProductBackgroundRemoval(
    image: ProductImageInput,
    purpose: ProductCutoutPurpose,
    refine: RefineOptions,
  ): Promise<ProductCutout> {
    this.assertConfigured();
    const modelId = CLOUDFLARE_TRYON_MODEL_FAST;
    const original = Buffer.from(stripDataUrl(image.base64), 'base64');
    const modelInput = await prepareProductModelInput(original, CLOUDFLARE_TRYON_MAX_IMAGE_PX);
    const prompt = buildProductBackgroundRemovalPrompt();

    this.logger.info(
      {
        provider: 'cloudflare',
        model: modelId,
        purpose,
        mimeType: image.mimeType,
        modelInput: modelInput.layout,
        credentialCount: this.options.credentials.length,
      },
      'Cloudflare product background removal started',
    );

    const credentialCount = this.options.credentials.length;
    const maxAttempts = credentialCount * Math.max(1, this.options.maxRetries + 1);
    let lastError: unknown;

    const generate = async (credential: CloudflareCredential, retry: boolean): Promise<ProductCutout> => {
      const started = Date.now();
      const generated = await withTimeout(
        this.invokeWorkersAi(
          retry ? buildProductBackgroundRemovalPrompt({ retry: true }) : prompt,
          [modelInput.buffer],
          credential,
          modelId,
          retry ? randomInt(1, 2_147_483_647) : undefined,
        ),
        Math.min(this.options.timeoutMs, 90_000),
        modelId,
      );
      const modelMs = Date.now() - started;
      const cutout = await refineProductCutout(
        original,
        Buffer.from(stripDataUrl(generated.base64), 'base64'),
        modelInput.layout,
        refine,
      );
      this.logger.info(
        {
          provider: 'cloudflare',
          model: modelId,
          purpose,
          retry,
          accountId: credential.accountId,
          modelMs,
          durationMs: Date.now() - started,
          size: `${cutout.width}x${cutout.height}`,
          ...cutout.stats,
        },
        'Cloudflare product background removal completed',
      );
      return cutout;
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const credential = this.getCredential();
      try {
        const first = await generate(credential, false);
        if (!first.stats.unchangedPhoto) {
          return first;
        }
        // The model kept the pouch / card / stand. Whether it does is largely down to the seed, so retry once
        // with a stricter prompt and a fresh seed, and keep whichever pass removed more.
        try {
          const second = await generate(credential, true);
          const keepSecond = !second.stats.unchangedPhoto || second.stats.foregroundRatio < first.stats.foregroundRatio;
          this.logger.info(
            {
              provider: 'cloudflare',
              model: modelId,
              purpose,
              kept: keepSecond ? 'retry' : 'first',
              firstForeground: first.stats.foregroundRatio,
              retryForeground: second.stats.foregroundRatio,
            },
            'Cloudflare product background removal retry compared',
          );
          if (keepSecond) {
            return second;
          }
        } catch (err) {
          this.logger.warn(
            { provider: 'cloudflare', model: modelId, purpose, failureReason: this.errorMessage(err) },
            'Cloudflare product background removal retry failed; keeping first result',
          );
        }
        return first;
      } catch (err) {
        lastError = err;
        const status = err instanceof AxiosError ? err.response?.status : (err as Error & { status?: number }).status;
        const willRotate = this.shouldRotateToken(err, status);
        this.logger.warn(
          {
            provider: 'cloudflare',
            model: modelId,
            purpose,
            attempt,
            maxAttempts,
            status,
            accountId: credential.accountId,
            failureReason: this.errorMessage(err),
          },
          'Cloudflare product background removal attempt failed',
        );
        if (willRotate) {
          this.rotateApiToken();
        }
        if (attempt < maxAttempts) {
          await this.delay(1_500 * attempt);
        }
      }
    }

    throw this.toTryOnException(lastError, (lastError as Error & { status?: number })?.status);
  }

  private assertConfigured(): void {
    if (!this.options.isConfigured) {
      throw new BadRequestException(
        'Try-on AI provider is not configured (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN missing)',
      );
    }
  }

  private getCredential(): CloudflareCredential {
    return this.options.credentials[this.keyPointer % this.options.credentials.length];
  }

  private rotateApiToken(): void {
    if (this.options.credentials.length <= 1) return;
    this.keyPointer = (this.keyPointer + 1) % this.options.credentials.length;
    this.logger.warn({ pointer: this.keyPointer }, 'Rotated Cloudflare API credential');
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private isAccountQuotaError(err: unknown, status?: number): boolean {
    const msg = this.errorMessage(err).toLowerCase();
    return (
      status === 429 &&
      (msg.includes('neurons') || msg.includes('daily free allocation') || msg.includes('workers paid'))
    );
  }

  private shouldRotateToken(err: unknown, status?: number): boolean {
    if (this.isAccountQuotaError(err, status)) {
      return this.options.credentials.length > 1;
    }
    if (this.options.credentials.length <= 1) {
      return false;
    }
    if (status === 401 || status === 403) {
      return true;
    }
    if (status != null && status >= 500) {
      return true;
    }
    const msg = this.errorMessage(err).toLowerCase();
    return msg.includes('rate limit');
  }

  private toTryOnException(err: unknown, status?: number): BadRequestException {
    const msg = this.errorMessage(err);
    if (this.isAccountQuotaError(err, status)) {
      return new BadRequestException(
        'Cloudflare Workers AI daily quota is exhausted. Upgrade to Workers Paid or try again tomorrow.',
      );
    }
    if (
      status === 401 ||
      status === 403 ||
      msg.toLowerCase().includes('authentication error') ||
      msg.toLowerCase().includes('invalid api token')
    ) {
      return new BadRequestException(
        'Cloudflare API token is invalid or missing Workers AI permissions. Update CLOUDFLARE_API_TOKEN.',
      );
    }
    return new BadRequestException(msg || 'Cloudflare try-on request failed');
  }

  private buildPrompt(request: JewelleryTryOnRequest, mode: 'jewellery' | 'outfit'): string {
    return buildFullTryOnPrompt(mode, request);
  }

  private async buildInputImages(request: JewelleryTryOnRequest): Promise<Buffer[]> {
    if (!request.personImage?.base64) {
      throw new BadRequestException('personImage is required');
    }

    const items = request.jewelleryItems ?? [];
    if (!items.length) {
      throw new BadRequestException('At least one jewellery item is required');
    }

    const sequence = buildTryOnImageSequence(request.personImage, items);
    if (sequence.length > 4) {
      throw new BadRequestException('Cloudflare FLUX models support at most 4 input images');
    }

    return Promise.all(sequence.map((image) => this.resizeForCloudflare(image)));
  }

  private async resizeForCloudflare(image: AiImageInput): Promise<Buffer> {
    const input = Buffer.from(stripDataUrl(image.base64), 'base64');
    return sharp(input)
      .rotate()
      .resize(CLOUDFLARE_TRYON_MAX_IMAGE_PX, CLOUDFLARE_TRYON_MAX_IMAGE_PX, {
        fit: 'cover',
      })
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  private resolveModelId(request: JewelleryTryOnRequest): string {
    return resolveCloudflareTryOnModelId(request.cloudflareModel, this.options.modelId);
  }

  private buildRunUrl(accountId: string, modelId: string): string {
    return `https://api.cloudflare.com/client/v4/accounts/${accountId.trim()}/ai/run/${modelId.trim()}`;
  }

  private usesFluxDevModel(modelId: string): boolean {
    return modelId.includes('flux-2-dev');
  }

  private async runOnce(
    request: JewelleryTryOnRequest,
    mode: 'jewellery' | 'outfit',
    seed?: number,
    variationIndex = 1,
    variationTotal = 1,
  ): Promise<GeneratedAiImage> {
    const prompt = this.buildPrompt(request, mode);
    const inputImages = await this.buildInputImages(request);
    const modelId = this.resolveModelId(request);
    const credentialCount = this.options.credentials.length;
    const maxAttempts = credentialCount * Math.max(1, this.options.maxRetries + 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const credential = this.getCredential();
      const started = Date.now();
      try {
        const image = await withTimeout(
          this.invokeWorkersAi(prompt, inputImages, credential, modelId, seed),
          this.options.timeoutMs,
          modelId,
        );
        this.logger.info(
          {
            provider: 'cloudflare',
            model: modelId,
            attempt,
            variationIndex,
            variationTotal,
            accountId: credential.accountId,
            durationMs: Date.now() - started,
            jewelleryCount: request.jewelleryItems.length,
          },
          'Cloudflare try-on completed',
        );
        return image;
      } catch (err) {
        lastError = err;
        const status = err instanceof AxiosError ? err.response?.status : (err as Error & { status?: number }).status;
        const failureReason = this.errorMessage(err);
        const willRotate = this.shouldRotateToken(err, status);
        const nextAction =
          attempt >= maxAttempts
            ? 'no more Cloudflare retries — job will fail'
            : willRotate
              ? `rotate API credential and retry (attempt ${attempt + 1}/${maxAttempts})`
              : `retry same credential (attempt ${attempt + 1}/${maxAttempts}) after ${1_500 * attempt}ms`;

        this.logger.warn(
          {
            provider: 'cloudflare',
            model: modelId,
            attempt,
            maxAttempts,
            variationIndex,
            variationTotal,
            status,
            accountId: credential.accountId,
            failureReason,
            nextAction,
          },
          'Cloudflare try-on attempt failed',
        );
        if (willRotate) {
          this.rotateApiToken();
        }
        if (attempt < maxAttempts) {
          await this.delay(1_500 * attempt);
        }
      }
    }

    const failureReason = this.errorMessage(lastError);
    this.logger.error(
      {
        provider: 'cloudflare',
        model: modelId,
        variationIndex,
        variationTotal,
        failureReason,
        nextAction: 'no more Cloudflare retries — job will fail',
      },
      'Cloudflare try-on failed',
    );
    throw this.toTryOnException(lastError, (lastError as Error & { status?: number })?.status);
  }

  private async invokeWorkersAi(
    prompt: string,
    inputImages: Buffer[],
    credential: CloudflareCredential,
    modelId: string,
    seed?: number,
  ): Promise<GeneratedAiImage> {
    const form = new FormData();
    form.append('prompt', prompt);
    inputImages.forEach((buffer, index) => {
      form.append(`input_image_${index}`, buffer, {
        filename: `input_${index}.jpg`,
        contentType: 'image/jpeg',
      });
    });
    form.append('width', '1024');
    form.append('height', '1024');
    if (this.usesFluxDevModel(modelId)) {
      form.append('steps', '25');
    }
    if (seed != null) {
      form.append('seed', String(seed));
    }

    const response = await axios.post<CloudflareRunResponse>(this.buildRunUrl(credential.accountId, modelId), form, {
      headers: {
        Authorization: `Bearer ${credential.apiToken}`,
        ...form.getHeaders(),
      },
      timeout: this.options.timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300 || response.data?.success === false) {
      const message =
        response.data?.errors?.[0]?.message || `Cloudflare Workers AI request failed with status ${response.status}`;
      const err = new Error(message);
      (err as Error & { status?: number }).status = response.status;
      throw err;
    }

    const base64 = response.data?.result?.image;
    if (!base64) {
      throw new BadRequestException('Cloudflare Workers AI returned no image output');
    }

    return toGeneratedImage(stripDataUrl(base64), CLOUDFLARE_TRYON_MIME);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
