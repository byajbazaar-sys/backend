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
  CLOUDFLARE_TRYON_MODEL,
  resolveCloudflareTryOnModelId,
} from '../ai.constants';
import { CloudflareTryOnOptions, type CloudflareCredential } from '../cloudflare-try-on.options';
import type { AiImageInput, AiJewelleryTryOnRequest, AiOutfitRecolorRequest } from '../interfaces';
import { buildProductBackgroundRemovalPrompt, buildFullTryOnPrompt, buildOutfitRecolorPrompt } from '../prompts';
import {
  detectDisplayBackdrop,
  displayBackdropCutout,
  stripDataUrl,
  toGeneratedImage,
  withTimeout,
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
  buildTryOnImageSequence,
} from '../utils';
import { CloudflareAccountPool } from './cloudflare-account-pool.service';

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

/** Workers AI chat + vision model used when no other is configured (CLOUDFLARE_TEXT_MODEL / CLOUDFLARE_VISION_MODEL). */
const DEFAULT_CHAT_MODEL = '@cf/google/gemma-4-26b-a4b-it';

@Injectable()
export class CloudflareTryOnService implements ITryOnAiService, IProductImageAiService {
  constructor(
    private readonly options: CloudflareTryOnOptions,
    private readonly pool: CloudflareAccountPool,
    @InjectPinoLogger(CloudflareTryOnService.name) private readonly logger: PinoLogger,
  ) {}

  async generateJewelleryTryOn(request: AiJewelleryTryOnRequest): Promise<GeneratedAiImage> {
    return (await this.generateTryOnImages(request, 'jewellery'))[0];
  }

  async generateOutfitTryOn(request: AiJewelleryTryOnRequest): Promise<GeneratedAiImage> {
    return (await this.generateTryOnImages(request, 'outfit'))[0];
  }

  async generateTryOnImages(
    request: AiJewelleryTryOnRequest,
    mode: 'jewellery' | 'outfit',
  ): Promise<GeneratedAiImage[]> {
    const count = Math.min(2, Math.max(1, request.variations ?? 2));
    const modelId = this.resolveModelId(request);
    this.logger.info(
      {
        provider: 'cloudflare',
        model: modelId,
        mode,
        variations: count,
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

  async recolorOutfit(request: AiOutfitRecolorRequest): Promise<GeneratedAiImage> {
    const credentials = await this.pool.credentials();
    const prompt = buildOutfitRecolorPrompt(request.color);
    const inputImage = await this.resizeForCloudflare(request.image);
    const modelId = resolveCloudflareTryOnModelId(undefined, this.options.modelId);
    const credentialCount = credentials.length;
    const maxAttempts = this.maxAttempts(credentials);
    let lastError: unknown;

    this.logger.info(
      { provider: 'cloudflare', model: modelId, color: request.color, credentialCount },
      'Cloudflare outfit recolor started',
    );

    for (let attempt = 1; attempt <= maxAttempts && credentials.length; attempt++) {
      const credential = this.pick(credentials);
      const started = Date.now();
      try {
        const image = await this.call('recolor', credential, modelId, this.options.timeoutMs, () =>
          this.invokeWorkersAi(prompt, [inputImage], credential, modelId),
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
        this.advance(credentials, credential, err, status);
        if (attempt < maxAttempts) await this.retryDelay(attempt, credentials);
      }
    }

    throw this.toTryOnException(lastError, (lastError as Error & { status?: number })?.status);
  }

  async generateMarketingImage(
    image: ProductImageInput,
    prompt: string,
    size: { width: number; height: number } = { width: 720, height: 1280 },
  ): Promise<GeneratedAiImage> {
    const credentials = await this.pool.credentials();
    // Whole product kept (no crop): the model restages it, it must not lose parts of the piece.
    const input = await sharp(Buffer.from(stripDataUrl(image.base64), 'base64'))
      .rotate()
      .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90 })
      .toBuffer();
    const modelId = resolveCloudflareTryOnModelId(undefined, this.options.modelId);
    const maxAttempts = this.maxAttempts(credentials);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts && credentials.length; attempt++) {
      const credential = this.pick(credentials);
      const started = Date.now();
      try {
        const generated = await this.call('marketing-image', credential, modelId, this.options.timeoutMs, () =>
          this.invokeWorkersAi(prompt, [input], credential, modelId, randomInt(1, 2_147_483_647), size),
        );
        this.logger.info(
          { provider: 'cloudflare', model: modelId, attempt, durationMs: Date.now() - started, ...size },
          'Cloudflare marketing image generated',
        );
        return generated;
      } catch (err) {
        lastError = err;
        const status = err instanceof AxiosError ? err.response?.status : (err as Error & { status?: number }).status;
        this.logger.warn(
          {
            provider: 'cloudflare',
            model: modelId,
            attempt,
            maxAttempts,
            status,
            failureReason: this.errorMessage(err),
          },
          'Cloudflare marketing image attempt failed',
        );
        this.advance(credentials, credential, err, status);
        if (attempt < maxAttempts) await this.retryDelay(attempt, credentials);
      }
    }
    throw this.toTryOnException(lastError, (lastError as Error & { status?: number })?.status);
  }

  async generateImageFromText(
    prompt: string,
    size: { width: number; height: number } = { width: 1024, height: 1024 },
  ): Promise<GeneratedAiImage> {
    const modelId = resolveCloudflareTryOnModelId(undefined, this.options.modelId);
    return this.withCredentialRetries('text-to-image', modelId, (credential) =>
      this.invokeWorkersAi(prompt, [], credential, modelId, randomInt(1, 2_147_483_647), size),
    );
  }

  /**
   * Workers AI chat model (prompt / script writing). Default Gemma 4 26B: the best multilingual model the free plan
   * runs (Hindi, Hinglish in Devanagari and the other voice languages), fast and cheap; `model` overrides it.
   */
  async generateText(
    system: string,
    user: string,
    options: { maxTokens?: number; temperature?: number; model?: string } = {},
  ): Promise<string> {
    const modelId = options.model?.trim() || process.env.CLOUDFLARE_TEXT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
    return this.chat(
      modelId,
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      options,
    );
  }

  /**
   * Image to text: the same multimodal model looks at a photo (resized to at most 768 px) and answers the prompt.
   * Gemma 4 described the kada stack best of the free-plan vision models (Nov 2026 check: right count, no invented
   * stones), at a fraction of the cost.
   */
  async describeImage(
    image: Buffer,
    prompt: string,
    options: { maxTokens?: number; temperature?: number; model?: string } = {},
  ): Promise<string> {
    const modelId = options.model?.trim() || process.env.CLOUDFLARE_VISION_MODEL?.trim() || DEFAULT_CHAT_MODEL;
    const jpeg = await sharp(image)
      .rotate()
      .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return this.chat(
      modelId,
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` } },
          ],
        },
      ],
      { temperature: 0.2, ...options },
    );
  }

  /** One chat call with credential rotation; both reply shapes (legacy `response`, OpenAI-style `choices`). */
  private async chat(
    modelId: string,
    messages: { role: string; content: unknown }[],
    options: { maxTokens?: number; temperature?: number },
  ): Promise<string> {
    const body: Record<string, unknown> = {
      messages,
      max_tokens: options.maxTokens ?? 900,
      temperature: options.temperature ?? 0.8,
    };
    // Reasoning models think first by default and can spend the whole token budget before answering.
    if (/gemma-4|qwen3/i.test(modelId)) body.chat_template_kwargs = { enable_thinking: false };
    if (/gpt-oss/i.test(modelId)) body.reasoning_effort = 'low';
    return this.withCredentialRetries('text', modelId, async (credential) => {
      const response = await axios.post<{
        success?: boolean;
        result?: { response?: unknown; choices?: { message?: { content?: unknown } }[] };
        errors?: { message?: string }[];
      }>(this.buildRunUrl(credential.accountId, modelId), body, {
        headers: { Authorization: `Bearer ${credential.apiToken}`, 'Content-Type': 'application/json' },
        timeout: 60_000,
        validateStatus: () => true,
      });
      if (response.status < 200 || response.status >= 300 || response.data?.success === false) {
        const err = new Error(
          response.data?.errors?.[0]?.message || `Workers AI text request failed (${response.status})`,
        );
        (err as Error & { status?: number }).status = response.status;
        throw err;
      }
      const result = response.data?.result;
      const reply = result?.choices?.[0]?.message?.content ?? result?.response;
      return typeof reply === 'string' ? reply : JSON.stringify(reply ?? '');
    });
  }

  /** Runs a Workers AI call, rotating credentials and retrying like the try-on flows. */
  private async withCredentialRetries<T>(
    label: string,
    modelId: string,
    run: (credential: CloudflareCredential) => Promise<T>,
  ): Promise<T> {
    const credentials = await this.pool.credentials();
    const maxAttempts = this.maxAttempts(credentials);
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts && credentials.length; attempt++) {
      const credential = this.pick(credentials);
      try {
        return await this.call(label, credential, modelId, this.options.timeoutMs, () => run(credential));
      } catch (err) {
        lastError = err;
        const status = err instanceof AxiosError ? err.response?.status : (err as Error & { status?: number }).status;
        this.logger.warn(
          {
            provider: 'cloudflare',
            label,
            model: modelId,
            attempt,
            maxAttempts,
            status,
            failureReason: this.errorMessage(err),
          },
          'Cloudflare request attempt failed',
        );
        this.advance(credentials, credential, err, status);
        if (attempt < maxAttempts) await this.retryDelay(attempt, credentials);
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
    const credentials = await this.pool.credentials();
    // FLUX.2 [klein] 9B (4B was removed): cleaner edges and fewer leftover props on jewellery.
    const modelId = CLOUDFLARE_TRYON_MODEL;
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
        credentialCount: credentials.length,
      },
      'Cloudflare product background removal started',
    );

    const maxAttempts = this.maxAttempts(credentials);
    let lastError: unknown;

    const generate = async (credential: CloudflareCredential, retry: boolean): Promise<ProductCutout> => {
      const started = Date.now();
      const generated = await this.call(
        'background-removal',
        credential,
        modelId,
        Math.min(this.options.timeoutMs, 90_000),
        () =>
          this.invokeWorkersAi(
            retry ? buildProductBackgroundRemovalPrompt({ retry: true }) : prompt,
            [modelInput.buffer],
            credential,
            modelId,
            retry ? randomInt(1, 2_147_483_647) : undefined,
          ),
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

    for (let attempt = 1; attempt <= maxAttempts && credentials.length; attempt++) {
      const credential = this.pick(credentials);
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
        this.advance(credentials, credential, err, status);
        if (attempt < maxAttempts) await this.retryDelay(attempt, credentials);
      }
    }

    throw this.toTryOnException(lastError, (lastError as Error & { status?: number })?.status);
  }

  /** Each attempt moves to the next account; after one pass, maxRetries more attempts. */
  private maxAttempts(credentials: CloudflareCredential[]): number {
    return credentials.length + Math.max(0, this.options.maxRetries);
  }

  /** The account to try next: the head of this request's queue. */
  private pick(credentials: CloudflareCredential[]): CloudflareCredential {
    return credentials[0];
  }

  /** Short pause while other accounts are left to try; back off once every account has been tried. */
  private retryDelay(attempt: number, credentials: CloudflareCredential[]): Promise<void> {
    return this.delay(attempt < credentials.length ? 200 : 1_500 * attempt);
  }

  /**
   * After a failed attempt: an account whose daily quota is used up, or whose token is rejected, leaves this
   * request's queue; any other failure sends it to the back, so the next account is tried first.
   */
  private advance(
    credentials: CloudflareCredential[],
    credential: CloudflareCredential,
    err: unknown,
    status?: number,
  ): void {
    const index = credentials.indexOf(credential);
    if (index < 0) return;
    credentials.splice(index, 1);
    if (!this.isAccountQuotaError(err, status) && status !== 401 && status !== 403) credentials.push(credential);
  }

  /** Runs one Workers AI call with a timeout and records it (account state + logs database). */
  private async call<T>(
    operation: string,
    credential: CloudflareCredential,
    modelId: string,
    timeoutMs: number,
    run: () => Promise<T>,
  ): Promise<T> {
    const started = Date.now();
    try {
      const result = await withTimeout(run(), timeoutMs, modelId);
      this.pool.reportSuccess(credential, { operation, model: modelId, durationMs: Date.now() - started });
      return result;
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : (err as Error & { status?: number }).status;
      this.pool.reportFailure(credential, {
        operation,
        model: modelId,
        durationMs: Date.now() - started,
        status,
        message: this.errorMessage(err),
        quota: this.isAccountQuotaError(err, status),
      });
      throw err;
    }
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

  private toTryOnException(err: unknown, status?: number): BadRequestException {
    const msg = this.errorMessage(err);
    if (this.isAccountQuotaError(err, status)) {
      return new BadRequestException(
        "Every Cloudflare account has used today's free Workers AI quota. Add another account in Admin → Cloudflare accounts, or try again after 00:00 UTC.",
      );
    }
    if (
      status === 401 ||
      status === 403 ||
      msg.toLowerCase().includes('authentication error') ||
      msg.toLowerCase().includes('invalid api token')
    ) {
      return new BadRequestException(
        'Cloudflare API token is invalid or missing Workers AI permissions. Update it in Admin → Cloudflare accounts.',
      );
    }
    return new BadRequestException(msg || 'Cloudflare try-on request failed');
  }

  private buildPrompt(request: AiJewelleryTryOnRequest, mode: 'jewellery' | 'outfit'): string {
    return buildFullTryOnPrompt(mode, request);
  }

  private async buildInputImages(request: AiJewelleryTryOnRequest): Promise<Buffer[]> {
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

  private resolveModelId(request: AiJewelleryTryOnRequest): string {
    return resolveCloudflareTryOnModelId(request.cloudflareModel, this.options.modelId);
  }

  private buildRunUrl(accountId: string, modelId: string): string {
    return `https://api.cloudflare.com/client/v4/accounts/${accountId.trim()}/ai/run/${modelId.trim()}`;
  }

  private usesFluxDevModel(modelId: string): boolean {
    return modelId.includes('flux-2-dev');
  }

  private async runOnce(
    request: AiJewelleryTryOnRequest,
    mode: 'jewellery' | 'outfit',
    seed?: number,
    variationIndex = 1,
    variationTotal = 1,
  ): Promise<GeneratedAiImage> {
    const prompt = this.buildPrompt(request, mode);
    const inputImages = await this.buildInputImages(request);
    const modelId = this.resolveModelId(request);
    const credentials = await this.pool.credentials();
    const maxAttempts = this.maxAttempts(credentials);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts && credentials.length; attempt++) {
      const credential = this.pick(credentials);
      const started = Date.now();
      try {
        const image = await this.call('try-on', credential, modelId, this.options.timeoutMs, () =>
          this.invokeWorkersAi(prompt, inputImages, credential, modelId, seed),
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
        this.advance(credentials, credential, err, status);
        const nextAction =
          attempt >= maxAttempts || !credentials.length
            ? 'no more Cloudflare retries — job will fail'
            : `retry on the next account (attempt ${attempt + 1}/${maxAttempts})`;

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
        if (attempt < maxAttempts) await this.retryDelay(attempt, credentials);
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
    size: { width: number; height: number } = { width: 1024, height: 1024 },
  ): Promise<GeneratedAiImage> {
    const form = new FormData();
    form.append('prompt', prompt);
    inputImages.forEach((buffer, index) => {
      form.append(`input_image_${index}`, buffer, {
        filename: `input_${index}.jpg`,
        contentType: 'image/jpeg',
      });
    });
    form.append('width', String(size.width));
    form.append('height', String(size.height));
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
