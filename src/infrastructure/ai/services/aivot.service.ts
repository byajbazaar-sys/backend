import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import axios, { AxiosError, type AxiosInstance } from 'axios';
import { randomUUID } from 'crypto';
import FormData from 'form-data';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { ITryOnAiService, GeneratedAiImage } from '../../../application';
import { AIVOT_TRYON_GENERATE_PATH, AIVOT_TRYON_MIME } from '../ai.constants';
import { AivotTryOnOptions } from '../aivot-try-on.options';
import { BedrockService } from './bedrock.service';
import { isTransientTryOnStatus, mapAivotHttpError } from '../exceptions/aivot-try-on.errors';
import type { JewelleryTryOnRequest, OutfitRecolorRequest } from '../interfaces/ai-media.types';
import { stripDataUrl } from '../utils/image.util';

interface AivotGenerateResponse {
  statusCode?: number;
  success?: boolean;
  message?: string;
  data?: {
    variation1?: string;
    variation2?: string;
  };
}

type JewelleryField = 'necklace' | 'earring';

@Injectable()
export class AivotService implements ITryOnAiService {
  private readonly http: AxiosInstance;

  constructor(
    private readonly options: AivotTryOnOptions,
    private readonly bedrock: BedrockService,
    @InjectPinoLogger(AivotService.name) private readonly logger: PinoLogger,
  ) {
    this.http = axios.create({
      baseURL: this.options.baseUrl.replace(/\/+$/, ''),
      timeout: this.options.timeoutMs,
      validateStatus: () => true,
    });
  }

  async generateJewelleryTryOn(request: JewelleryTryOnRequest): Promise<GeneratedAiImage> {
    return (await this.generateTryOnImages(request, 'jewellery'))[0];
  }

  async generateOutfitTryOn(request: JewelleryTryOnRequest): Promise<GeneratedAiImage> {
    return (await this.generateTryOnImages(request, 'outfit'))[0];
  }

  async generateTryOnImages(
    request: JewelleryTryOnRequest,
    _mode: 'jewellery' | 'outfit',
  ): Promise<GeneratedAiImage[]> {
    this.assertConfigured();
    this.logger.info(
      {
        provider: 'aivot',
        baseUrl: this.options.baseUrl,
        timeoutMs: this.options.timeoutMs,
        maxRetries: this.options.maxRetries,
        variations: request.variations ?? 1,
      },
      'Aivot try-on processing started',
    );
    const images = await this.callGenerateStyledImage(request);
    if (!images.length) {
      throw new BadRequestException('Try-on AI provider returned no images');
    }
    return images;
  }

  async recolorOutfit(request: OutfitRecolorRequest): Promise<GeneratedAiImage> {
    return this.bedrock.recolorOutfit(request);
  }

  private mapVariation(variations?: number): '1' | '2' | 'both' {
    const count = Math.min(2, Math.max(1, variations ?? 2));
    return count >= 2 ? 'both' : '1';
  }

  private assertConfigured(): void {
    if (!this.options.isConfigured) {
      throw new BadRequestException('Try-on AI provider is not configured (TRYON_API_BASE_URL is missing)');
    }
  }

  private buildFormData(request: JewelleryTryOnRequest): FormData {
    if (!request.personImage?.base64) {
      throw new BadRequestException('personImage is required');
    }

    const outfit = request.outfit?.trim();
    if (!outfit) {
      throw new BadRequestException('outfit is required and must be a non-empty string');
    }

    const items = request.jewelleryItems ?? [];
    if (!items.length) {
      throw new BadRequestException('At least one jewellery item is required');
    }

    const necklace = items.find((i) => i.type === 'necklace');
    const earring = items.find((i) => i.type === 'earring');
    const fallback = items[0];

    const form = new FormData();
    form.append('personImage', Buffer.from(stripDataUrl(request.personImage.base64), 'base64'), {
      filename: 'person.jpg',
      contentType: request.personImage.mimeType || AIVOT_TRYON_MIME,
    });

    if (necklace?.base64) {
      form.append('necklace', Buffer.from(stripDataUrl(necklace.base64), 'base64'), {
        filename: 'necklace.jpg',
        contentType: necklace.mimeType || AIVOT_TRYON_MIME,
      });
    } else if (!earring && fallback?.base64) {
      const field: JewelleryField = fallback.type === 'earring' ? 'earring' : 'necklace';
      form.append(field, Buffer.from(stripDataUrl(fallback.base64), 'base64'), {
        filename: `${field}.jpg`,
        contentType: fallback.mimeType || AIVOT_TRYON_MIME,
      });
    }

    if (earring?.base64) {
      form.append('earring', Buffer.from(stripDataUrl(earring.base64), 'base64'), {
        filename: 'earring.jpg',
        contentType: earring.mimeType || AIVOT_TRYON_MIME,
      });
      if (earring.heightInInches != null && earring.heightInInches > 0) {
        form.append('earringHeightInInches', String(earring.heightInInches));
      }
    }

    form.append('outfit', outfit);
    if (request.occasion?.trim()) form.append('occasion', request.occasion.trim());
    if (request.color?.trim()) form.append('outfitColor', request.color.trim());
    form.append('variation', this.mapVariation(request.variations));
    return form;
  }

  private mapResponseImages(data: AivotGenerateResponse['data']): GeneratedAiImage[] {
    const images: GeneratedAiImage[] = [];
    if (data?.variation1) images.push({ base64: data.variation1, mimeType: AIVOT_TRYON_MIME });
    if (data?.variation2) images.push({ base64: data.variation2, mimeType: AIVOT_TRYON_MIME });
    return images;
  }

  private extractProviderMessage(data: unknown): string {
    if (!data || typeof data !== 'object') return undefined;
    const body = data as { message?: unknown; error?: unknown };
    if (typeof body.message === 'string') return body.message;
    if (typeof body.error === 'string') return body.error;
    return undefined;
  }

  private async callGenerateStyledImage(
    request: JewelleryTryOnRequest,
    signal?: AbortSignal,
  ): Promise<GeneratedAiImage[]> {
    const endpoint = AIVOT_TRYON_GENERATE_PATH;
    const correlationId = randomUUID();
    const maxAttempts = Math.max(1, this.options.maxRetries + 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = Date.now();
      try {
        const form = this.buildFormData(request);
        const response = await this.http.post<AivotGenerateResponse>(endpoint, form, {
          headers: form.getHeaders(),
          signal,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });

        const durationMs = Date.now() - started;
        const status = response.status;
        this.logger.info({ endpoint, status, durationMs, correlationId, attempt }, 'Aivot try-on done');

        if (status >= 200 && status < 300) {
          const body = response.data;
          if (body?.success === false) {
            throw mapAivotHttpError(body.statusCode ?? 422, body.message);
          }
          const images = this.mapResponseImages(body?.data);
          if (!images.length) {
            throw new BadRequestException(body?.message || 'Try-on AI provider returned an empty result');
          }
          return images;
        }

        if (isTransientTryOnStatus(status) && attempt < maxAttempts) {
          this.logRetryScheduled({
            correlationId,
            attempt,
            maxAttempts,
            reason: `HTTP ${status}`,
            nextAction: `retry same provider (attempt ${attempt + 1}/${maxAttempts}) after ${this.retryDelayMs(attempt)}ms`,
          });
          await this.delay(this.retryDelayMs(attempt));
          continue;
        }
        throw mapAivotHttpError(status, this.extractProviderMessage(response.data));
      } catch (err) {
        lastError = err;
        const durationMs = Date.now() - started;

        if (err instanceof HttpException) throw err;

        if (axios.isCancel(err) || (err as Error)?.name === 'CanceledError') {
          throw new BadRequestException('Try-on request was cancelled');
        }

        const axiosErr = err as AxiosError;
        const status = axiosErr.response?.status;

        if ((axiosErr.code === 'ECONNABORTED' || axiosErr.code === 'ETIMEDOUT') && attempt < maxAttempts) {
          this.logRetryScheduled({
            correlationId,
            attempt,
            maxAttempts,
            reason: axiosErr.code,
            nextAction: `retry same provider (attempt ${attempt + 1}/${maxAttempts}) after ${this.retryDelayMs(attempt)}ms`,
          });
          await this.delay(this.retryDelayMs(attempt));
          continue;
        }
        if (axiosErr.code === 'ECONNABORTED' || axiosErr.code === 'ETIMEDOUT') {
          throw mapAivotHttpError(408, 'Try-on AI provider request timed out');
        }

        if (status != null) {
          if (isTransientTryOnStatus(status) && attempt < maxAttempts) {
            this.logRetryScheduled({
              correlationId,
              attempt,
              maxAttempts,
              reason: `HTTP ${status}`,
              nextAction: `retry same provider (attempt ${attempt + 1}/${maxAttempts}) after ${this.retryDelayMs(attempt)}ms`,
            });
            await this.delay(this.retryDelayMs(attempt));
            continue;
          }
          throw mapAivotHttpError(status, this.extractProviderMessage(axiosErr.response?.data));
        }

        if (attempt < maxAttempts) {
          this.logRetryScheduled({
            correlationId,
            attempt,
            maxAttempts,
            reason: axiosErr.message || 'network error',
            nextAction: `retry same provider (attempt ${attempt + 1}/${maxAttempts}) after ${this.retryDelayMs(attempt)}ms`,
          });
          await this.delay(this.retryDelayMs(attempt));
          continue;
        }

        this.logger.error(
          {
            endpoint,
            durationMs,
            correlationId,
            attempt,
            maxAttempts,
            failureReason: axiosErr.message || 'Unknown error',
            nextAction: 'no more Aivot retries — job will fail',
          },
          'Aivot try-on failed',
        );
        throw mapAivotHttpError(502, 'Try-on AI provider is unreachable');
      }
    }

    throw lastError instanceof Error ? lastError : mapAivotHttpError(502, 'Try-on AI provider request failed');
  }

  private retryDelayMs(attempt: number): number {
    return Math.min(2_000 * attempt, 6_000);
  }

  private logRetryScheduled(input: {
    correlationId: string;
    attempt: number;
    maxAttempts: number;
    reason: string;
    nextAction: string;
  }): void {
    this.logger.warn(
      {
        provider: 'aivot',
        correlationId: input.correlationId,
        attempt: input.attempt,
        maxAttempts: input.maxAttempts,
        failureReason: input.reason,
        nextAction: input.nextAction,
      },
      'Aivot try-on attempt failed — scheduling retry',
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
