import { Injectable } from '@nestjs/common';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  GEMINI_TRYON_TIMEOUT_MS,
  resolveBedrockModelId,
} from '../ai.constants';
import { AIOptions } from '../ai.options';
import type {
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
import {
  buildJewelleryTryOnPrompt,
  buildOutfitRecolorPrompt,
  buildOutfitTryOnPrompt,
} from '../prompts/try-on.prompts';
import { buildBasicEventsPrompt, buildEnrichEventsPrompt } from '../prompts/events.prompts';
import { extractJsonObject } from '../utils/ai-response.util';
import { mimeToImageFormat, stripDataUrl, toGeneratedImage, withTimeout } from '../utils/image.util';

@Injectable()
export class BedrockService implements ITryOnAiService, IEventsDiscoveryService {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(
    options: AIOptions,
    @InjectPinoLogger(BedrockService.name) private readonly logger: PinoLogger,
  ) {
    const accessKeyId =
      process.env.BEDROCK_AWS_ACCESS_KEY_ID ||
      process.env.LAMBDA_AWS_ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey =
      process.env.BEDROCK_AWS_SECRET_ACCESS_KEY ||
      process.env.LAMBDA_AWS_SECRET_ACCESS_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      '';

    this.client = new BedrockRuntimeClient({
      region: options.bedrockRegion,
      ...(accessKeyId ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
    this.modelId = resolveBedrockModelId(options.bedrockModelId);
    this.logger.info({ modelId: this.modelId, region: options.bedrockRegion }, 'Bedrock ready');
  }

  // --- Try-on ---

  async generateJewelleryTryOn(request: JewelleryTryOnRequest): Promise<GeneratedAiImage> {
    const prompt = buildJewelleryTryOnPrompt(request.jewelleryItems);
    this.logger.info({ jewelleryCount: request.jewelleryItems.length }, 'Bedrock jewellery try-on');
    return this.generateTryOnImage(
      [request.personImage, ...request.jewelleryItems],
      `${prompt}\n\nGenerate a single photorealistic output image.`,
    );
  }

  async generateOutfitTryOn(request: JewelleryTryOnRequest): Promise<GeneratedAiImage> {
    const prompt = buildOutfitTryOnPrompt({
      items: request.jewelleryItems,
      outfit: request.outfit,
      occasion: request.occasion,
      color: request.color,
    });
    this.logger.info({ outfit: request.outfit }, 'Bedrock outfit try-on');
    return this.generateTryOnImage(
      [request.personImage, ...request.jewelleryItems],
      `${prompt}\n\nGenerate a single photorealistic output image.`,
    );
  }

  async recolorOutfit(request: OutfitRecolorRequest): Promise<GeneratedAiImage> {
    const prompt = buildOutfitRecolorPrompt(request.color);
    this.logger.info({ color: request.color }, 'Bedrock outfit recolor');
    return this.generateTryOnImage(
      [request.image],
      `${prompt}\n\nGenerate a single photorealistic output image.`,
    );
  }

  private async generateTryOnImage(
    images: Array<{ base64: string; mimeType: string }>,
    prompt: string,
  ): Promise<GeneratedAiImage> {
    return withTimeout(
      this.converseWithImages(prompt, images),
      GEMINI_TRYON_TIMEOUT_MS,
      'bedrock-try-on',
    );
  }

  private async converseWithImages(
    prompt: string,
    images: Array<{ base64: string; mimeType: string }>,
    maxTokens = 4096,
  ): Promise<GeneratedAiImage> {
    const content: ContentBlock[] = [
      ...images.map((img) => ({
        image: {
          format: mimeToImageFormat(img.mimeType),
          source: { bytes: Uint8Array.from(Buffer.from(stripDataUrl(img.base64), 'base64')) },
        },
      })),
      { text: prompt },
    ];

    const response = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        messages: [{ role: 'user', content }],
        inferenceConfig: { maxTokens },
      }),
    );

    const outputBlocks = response.output?.message?.content ?? [];
    for (const block of outputBlocks) {
      if (block.image?.source?.bytes) {
        const base64 = Buffer.from(block.image.source.bytes).toString('base64');
        const mimeType =
          block.image.format === 'jpeg'
            ? 'image/jpeg'
            : block.image.format === 'png'
              ? 'image/png'
              : 'image/png';
        return toGeneratedImage(base64, mimeType);
      }
    }

    const text = outputBlocks.map((b) => b.text ?? '').join('');
    this.logger.warn({ textPreview: text.slice(0, 200) }, 'Bedrock returned no image block');
    throw new Error('No image returned from Bedrock Nova model');
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
    try {
      const text = await this.converseText(prompt, 4096);
      const parsed = JSON.parse(extractJsonObject(text, 'Bedrock')) as DiscoveredEventsPayload;
      return { events: Array.isArray(parsed.events) ? parsed.events : [] };
    } catch (err) {
      this.logger.warn({ err }, 'Bedrock events call failed');
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  private async converseText(prompt: string, maxTokens = 4096): Promise<string> {
    const response = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens },
      }),
    );
    return (response.output?.message?.content ?? [])
      .map((b) => b.text ?? '')
      .join('')
      .trim();
  }
}
