import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  GEMINI_EVENTS_MODEL,
  GEMINI_TRYON_FALLBACK_MODEL,
  GEMINI_TRYON_MODEL,
  GEMINI_TRYON_TIMEOUT_MS,
} from '../ai.constants';
import { AIOptions } from '../ai.options';
import type {
  AiImageInput,
  JewelleryTryOnRequest,
  OutfitRecolorRequest,
} from '../interfaces/ai-media.types';
import type {
  DiscoveredEvent,
  DiscoveredEventsPayload,
  GeneratedAiImage,
  IEventsDiscoveryService,
  ITryOnAiService,
} from '../../../application';
import { buildBasicEventsPrompt, buildEnrichEventsPrompt } from '../prompts/events.prompts';
import {
  buildFullTryOnPrompt,
  buildOutfitRecolorPrompt,
} from '../prompts/try-on.prompts';
import { extractJsonObject } from '../utils/ai-response.util';
import { buildTryOnImageSequence } from '../utils/try-on-images.util';
import { stripDataUrl, toGeneratedImage, withTimeout } from '../utils/image.util';

type GoogleGenAICtor = new (opts: { apiKey: string }) => {
  models: { generateContent: (args: Record<string, unknown>) => Promise<unknown> };
};

type GeminiGenClient = {
  models: { generateContent: (args: Record<string, unknown>) => Promise<unknown> };
};

type GeminiPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

@Injectable()
export class GeminiService implements ITryOnAiService, IEventsDiscoveryService {
  private genClients: GeminiGenClient[] = [];
  private keyPointer = 0;
  private keyInitPromise: Promise<void> = null;

  constructor(
    private readonly options: AIOptions,
    @InjectPinoLogger(GeminiService.name) private readonly logger: PinoLogger,
  ) {}

  // --- Key pool (@google/genai) ---

  private async ensureGenClients(): Promise<void> {
    if (this.genClients.length) return;
    if (this.keyInitPromise) return this.keyInitPromise;

    this.keyInitPromise = (async () => {
      const keys = this.options.geminiApiKeys.length
        ? this.options.geminiApiKeys
        : this.options.geminiApiKey
          ? [this.options.geminiApiKey]
          : [];
      if (!keys.length) {
        this.logger.warn('No Gemini API keys configured');
        return;
      }
      const mod = (await import('@google/genai')) as unknown as { GoogleGenAI: GoogleGenAICtor };
      this.genClients = keys.map((apiKey) => new mod.GoogleGenAI({ apiKey }));
      this.logger.info({ keyCount: keys.length }, 'Gemini gen clients ready');
    })();

    await this.keyInitPromise;
  }

  private getGenClient(): GeminiGenClient {
    if (!this.genClients.length) {
      throw new Error('No Gemini API keys configured (GEMINI_API_KEYS)');
    }
    const client = this.genClients[this.keyPointer];
    this.keyPointer = (this.keyPointer + 1) % this.genClients.length;
    return client;
  }

  private rotateKey(): void {
    if (!this.genClients.length) return;
    this.keyPointer = (this.keyPointer + 1) % this.genClients.length;
    this.logger.warn({ pointer: this.keyPointer }, 'Rotated Gemini API key');
  }

  private shouldRotateKey(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('429') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('401') ||
      msg.includes('403') ||
      msg.toLowerCase().includes('quota') ||
      msg.toLowerCase().includes('rate limit')
    );
  }

  // --- Try-on ---

  async generateJewelleryTryOn(request: JewelleryTryOnRequest): Promise<GeneratedAiImage> {
    const prompt = buildFullTryOnPrompt('jewellery', request);
    const images = buildTryOnImageSequence(request.personImage, request.jewelleryItems);
    this.logger.info({ jewelleryCount: request.jewelleryItems.length }, 'Gemini jewellery try-on');
    return this.generateImage([...images, prompt]);
  }

  async generateOutfitTryOn(request: JewelleryTryOnRequest): Promise<GeneratedAiImage> {
    const prompt = buildFullTryOnPrompt('outfit', request);
    const images = buildTryOnImageSequence(request.personImage, request.jewelleryItems);
    this.logger.info({ outfit: request.outfit, occasion: request.occasion }, 'Gemini outfit try-on');
    return this.generateImage([...images, prompt]);
  }

  async recolorOutfit(request: OutfitRecolorRequest): Promise<GeneratedAiImage> {
    const prompt = buildOutfitRecolorPrompt(request.color);
    this.logger.info({ color: request.color }, 'Gemini outfit recolor');
    return this.generateImage([request.image, prompt]);
  }

  private async generateImage(parts: Array<AiImageInput | string>): Promise<GeneratedAiImage> {
    await this.ensureGenClients();
    const geminiParts: GeminiPart[] = parts.map((p) =>
      typeof p === 'string'
        ? { text: p }
        : {
            inlineData: {
              data: stripDataUrl(p.base64),
              mimeType: p.mimeType || 'image/jpeg',
            },
          },
    );

    const runModel = async (model: string): Promise<GeneratedAiImage> => {
      let lastError: unknown;
      const maxAttempts = Math.max(3, this.genClients.length || 1);
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const ai = this.getGenClient();
          const response = await ai.models.generateContent({
            model,
            contents: [{ parts: geminiParts }],
            config: {
              responseModalities: ['IMAGE'],
              outputImageDimensions: { width: 1024, height: 1024 },
            },
          });
          const image = this.extractGeneratedImage(response);
          if (!image) throw new Error(`No image returned from ${model}`);
          return image;
        } catch (err) {
          lastError = err;
          this.logger.warn({ err, attempt, model }, 'Gemini image generation failed');
          if (this.shouldRotateKey(err)) this.rotateKey();
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    };

    const timeoutMs = GEMINI_TRYON_TIMEOUT_MS;
    try {
      return await withTimeout(runModel(GEMINI_TRYON_MODEL), timeoutMs, GEMINI_TRYON_MODEL);
    } catch (primaryErr) {
      this.logger.warn({ err: primaryErr }, 'Primary try-on model failed — racing fallback');
      const primaryRetry = withTimeout(runModel(GEMINI_TRYON_MODEL), timeoutMs * 2, GEMINI_TRYON_MODEL);
      const fallback = withTimeout(runModel(GEMINI_TRYON_FALLBACK_MODEL), timeoutMs * 2, GEMINI_TRYON_FALLBACK_MODEL);
      return await new Promise<GeneratedAiImage>((resolve, reject) => {
        let settled = false;
        const failReasons: unknown[] = [];
        const onDone = (result: PromiseSettledResult<GeneratedAiImage>) => {
          if (settled) return;
          if (result.status === 'fulfilled') {
            settled = true;
            resolve(result.value);
            return;
          }
          failReasons.push(result.reason);
          if (failReasons.length >= 2) {
            settled = true;
            reject(failReasons[0] instanceof Error ? failReasons[0] : new Error(String(failReasons[0])));
          }
        };
        primaryRetry.then(
          (v) => onDone({ status: 'fulfilled', value: v }),
          (e) => onDone({ status: 'rejected', reason: e }),
        );
        fallback.then(
          (v) => onDone({ status: 'fulfilled', value: v }),
          (e) => onDone({ status: 'rejected', reason: e }),
        );
      });
    }
  }

  private extractGeneratedImage(response: unknown): GeneratedAiImage {
    const res = response as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
    };
    for (const part of res?.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return toGeneratedImage(part.inlineData.data, part.inlineData.mimeType || 'image/png');
      }
    }
    return null;
  }

  // --- Events discovery ---

  async fetchBasicEventsForState(state: string): Promise<DiscoveredEvent[]> {
    const payload = await this.callEventsPrompt(buildBasicEventsPrompt(state));
    return payload.events.filter((e) => (e.name ?? '').trim().length > 0);
  }

  async enrichEvents(events: DiscoveredEvent[]): Promise<DiscoveredEvent[]> {
    if (!events.length) return [];
    const payload = await this.callEventsPrompt(buildEnrichEventsPrompt(events));
    const detailMap = new Map<string, DiscoveredEvent>();
    for (const e of payload.events) {
      if (e.name) detailMap.set(e.name, e);
    }
    return events.map((event) => ({
      ...event,
      ...(detailMap.get(event.name ?? '') || {}),
    }));
  }

  private async callEventsPrompt(prompt: string): Promise<DiscoveredEventsPayload> {
    await this.ensureGenClients();
    let lastError: unknown;
    for (let retry = 0; retry < Math.max(4, this.genClients.length || 1); retry++) {
      try {
        const ai = this.getGenClient();
        const response = (await ai.models.generateContent({
          model: GEMINI_EVENTS_MODEL,
          contents: prompt,
          config: {
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            tools: [{ googleSearch: {} }],
          },
        })) as { text?: string };
        const parsed = JSON.parse(extractJsonObject(response.text ?? '', 'Gemini')) as DiscoveredEventsPayload;
        return { events: Array.isArray(parsed.events) ? parsed.events : [] };
      } catch (err) {
        lastError = err;
        this.logger.warn({ err, retry }, 'Gemini events call failed');
        if (this.shouldRotateKey(err)) this.rotateKey();
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
