import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { CreateVoiceoverInput } from './create-voiceover-input';
import {
  AdScriptFacts,
  AdScriptStyle,
  PRODUCT_LOOK_PROMPT,
  ProductLook,
  parseProductLook,
  adScriptPrompt,
  buildAdScript,
  checkAdScript,
  checkSpokenName,
  isDevanagariName,
  spokenNamePrompt,
} from '../utils';
import { VoiceoverView } from './voiceover-view';
import {
  EAssetStatus,
  EVoiceoverStatus,
  IMarketingBrandsRepository,
  IMarketingCatalog,
  IMarketingTextWriter,
  MARKETING_BRANDS_REPOSITORY,
  MARKETING_TEXT_WRITER,
  IMarketingFileStorage,
  IMarketingVoiceoversRepository,
  MARKETING_CATALOG,
  IRenderJobsRepository,
  MARKETING_FILE_STORAGE,
  MARKETING_VOICEOVERS_REPOSITORY,
  MarketingEvents,
  MarketingKeys,
  RENDER_JOBS_REPOSITORY,
  RenderJob,
  Voiceover,
  VoiceoverSettings,
} from '../../../shared';
import { MarketingRenderService, kaggleJobStatus } from '../../kaggle';

const MAX_ACTIVE_PER_USER = 3;
const MAX_SAMPLE_BYTES = 6 * 1024 * 1024;
const LIST_LIMIT = 50;
/** What the vision model saw on each item photo (one look per photo; a warm Lambda reuses it). */
const LOOKS = new Map<string, ProductLook>();
const LOOK_CACHE_SIZE = 300;
const SAMPLE_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
};
/** The ChatterBox Multilingual node's own defaults (as in ComfyUI). */
const DEFAULT_SETTINGS: Omit<VoiceoverSettings, 'seed'> = {
  speed: 1,
  exaggeration: 0.5,
  cfgWeight: 0.5,
  temperature: 0.8,
  repetitionPenalty: 2,
  minP: 0.05,
  topP: 1,
};

/**
 * Voiceovers: text spoken in the voice of an uploaded sample, in one of 23 languages (ChatterBox Multilingual on a
 * Kaggle GPU, the voice notebook). Jobs wait for a free warm worker like every other render job.
 */
@Injectable()
export class MarketingVoiceoverService {
  constructor(
    @Inject(MARKETING_VOICEOVERS_REPOSITORY) private readonly voiceovers: IMarketingVoiceoversRepository,
    @Inject(MARKETING_FILE_STORAGE) private readonly storage: IMarketingFileStorage,
    @Inject(MARKETING_CATALOG) private readonly catalog: IMarketingCatalog,
    @Inject(MARKETING_TEXT_WRITER) private readonly writer: IMarketingTextWriter,
    @Inject(MARKETING_BRANDS_REPOSITORY) private readonly brands: IMarketingBrandsRepository,
    @Inject(RENDER_JOBS_REPOSITORY) private readonly jobs: IRenderJobsRepository,
    private readonly render: MarketingRenderService,
    private readonly events: MarketingEvents,
    @InjectPinoLogger(MarketingVoiceoverService.name) private readonly logger: PinoLogger,
  ) {}

  async create(userId: string, input: CreateVoiceoverInput): Promise<VoiceoverView> {
    const text = input.text.trim();
    if (!text) throw new BadRequestException('Type the text to speak.');
    if ((await this.voiceovers.countActiveForUser(userId)) >= MAX_ACTIVE_PER_USER) {
      throw new BadRequestException(
        `You can have ${MAX_ACTIVE_PER_USER} voiceovers in progress at a time. Try again in a minute.`,
      );
    }
    let reuseKey: string | null = null;
    let upload: { data: Buffer; ext: string; mime: string } | null = null;
    if (input.sample?.base64) {
      const ext = SAMPLE_EXT[input.sample.mimeType];
      if (!ext) throw new BadRequestException('Upload the voice as MP3, WAV, M4A, OGG, WEBM or FLAC.');
      const data = Buffer.from(input.sample.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (!data.length || data.length > MAX_SAMPLE_BYTES) {
        throw new BadRequestException('The voice sample must be under 6 MB (30–60 seconds is plenty).');
      }
      upload = { data, ext, mime: input.sample.mimeType };
    } else if (input.sampleFromId) {
      const earlier = await this.voiceovers.findForUser(input.sampleFromId, userId);
      if (!earlier) throw new BadRequestException('That earlier voice sample was not found.');
      reuseKey = earlier.sampleKey;
    } else {
      throw new BadRequestException('Add a voice sample (6 seconds or more of clear speech).');
    }

    const settings: VoiceoverSettings = {
      ...DEFAULT_SETTINGS,
      ...Object.fromEntries(Object.entries(input.settings ?? {}).filter(([, v]) => typeof v === 'number')),
      seed: typeof input.settings?.seed === 'number' ? input.settings.seed : randomInt(0, 2 ** 31),
    };
    const voiceover = await this.voiceovers.create({
      userId,
      title: (input.title?.trim() || text.replace(/\s+/g, ' ').slice(0, 60)).slice(0, 255),
      text,
      language: input.language,
      settings,
      sampleKey: reuseKey ?? '',
      audioKey: null,
      status: EVoiceoverStatus.Generating,
    });
    if (upload) {
      try {
        const sampleKey = await this.storage.writeAsync(
          MarketingKeys.voiceSample(userId, voiceover.id, upload.ext),
          upload.data,
          upload.mime,
        );
        await this.voiceovers.update(voiceover.id, { sampleKey });
      } catch (err) {
        await this.voiceovers.delete(voiceover.id);
        throw err;
      }
    }
    await this.render.queueVoiceover(voiceover.id);
    return this.get(userId, voiceover.id);
  }

  /**
   * An advertisement script for one inventory item (English, Hindi or Hinglish in Devanagari) — new phrasing every
   * call, only the item's real facts (piece, metal, purity, weight, hallmark) and the shop's name.
   */
  async writeScript(
    userId: string,
    inventoryItemId: string,
    style: AdScriptStyle,
  ): Promise<{
    text: string;
    language: string;
    style: string;
    title: string;
    source: 'ai' | 'template';
    spokenShopName?: string;
  }> {
    const item = await this.catalog.findItem(userId, inventoryItemId);
    if (!item) throw new NotFoundException('Inventory item not found');
    const shopName = await this.businessName(userId);
    // Hindi / Hinglish: the shop name as it is said (Devanagari), so the Hindi voice pronounces it right.
    const spoken = style !== 'en' && shopName ? await this.spokenShopName(userId, shopName) : null;
    const facts: AdScriptFacts = {
      itemName: item.itemName,
      categoryName: item.categoryName,
      metalType: item.metalType,
      purity: item.purity,
      weightGrams: item.netWeight ?? item.grossWeight,
      hallmarked: item.hallmarked,
      shopName: spoken ?? shopName,
    };
    const language = style === 'en' ? 'en' : 'hi';
    const look = await this.productLook(item.id, item.imageKey, item.metalType);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { system, user } = adScriptPrompt(facts, style, Math.random, look);
        const text = checkAdScript(await this.writer.write(system, user, { temperature: 0.95 }), facts, style);
        if (text)
          return { text, language, style, title: item.itemName, source: 'ai', spokenShopName: spoken ?? undefined };
      } catch (err) {
        this.logger.warn({ err: (err as Error).message, style }, 'Ad script model unavailable — using the templates');
        break;
      }
    }
    const { text } = buildAdScript(facts, style);
    return { text, language, style, title: item.itemName, source: 'template', spokenShopName: spoken ?? undefined };
  }

  /** How the shop name is said in Hindi / Hinglish voiceovers (and whether the owner set it). */
  async shopName(userId: string): Promise<{ businessName: string | null; spokenName: string | null; byUser: boolean }> {
    const businessName = await this.businessName(userId);
    const spokenName = businessName ? await this.spokenShopName(userId, businessName) : null;
    const brand = await this.brands.find(userId);
    return { businessName, spokenName, byUser: !!brand?.spokenNameByUser };
  }

  /** The owner's own spelling of the spoken shop name (Devanagari); empty = let the model write it again. */
  async setSpokenShopName(
    userId: string,
    spokenName: string,
  ): Promise<{ businessName: string | null; spokenName: string | null; byUser: boolean }> {
    const value = spokenName.replace(/\s+/g, ' ').trim();
    if (value && !isDevanagariName(value)) {
      throw new BadRequestException('Write the shop name in Devanagari (Hindi letters), as it should be said.');
    }
    const businessName = (await this.businessName(userId)) ?? '';
    await this.saveBrand(userId, businessName, {
      spokenName: value || null,
      spokenNameFor: value ? businessName : null,
      spokenNameByUser: !!value,
    });
    return this.shopName(userId);
  }

  /**
   * The shop name in Devanagari as it is pronounced: the owner's spelling when set, else the text model's
   * transliteration (made once per name, then reused). Null when neither is available (the Latin name is spoken).
   */
  private async spokenShopName(userId: string, name: string): Promise<string | null> {
    if (isDevanagariName(name)) return name;
    const brand = await this.brands.find(userId);
    if (brand?.spokenName && (brand.spokenNameByUser || brand.spokenNameFor === name)) return brand.spokenName;
    try {
      const { system, user } = spokenNamePrompt(name);
      const spoken = checkSpokenName(await this.writer.write(system, user, { temperature: 0.1, maxTokens: 60 }), name);
      if (!spoken) return null;
      await this.saveBrand(userId, name, { spokenName: spoken, spokenNameFor: name, spokenNameByUser: false });
      return spoken;
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'Could not transliterate the shop name');
      return null;
    }
  }

  /**
   * Image to text: what the item's photo shows (motifs, enamel colours, bells …), so the script describes this very
   * piece. Optional — no photo or no vision model simply means a script from the facts alone.
   */
  private async productLook(itemId: string, imageKey?: string, metalType?: string): Promise<ProductLook> {
    if (!imageKey) return {};
    const key = `${itemId}:${imageKey}`;
    const cached = LOOKS.get(key);
    if (cached) return cached;
    try {
      const photo = await this.catalog.readImage(imageKey);
      const look = parseProductLook(
        await this.writer.see(photo, PRODUCT_LOOK_PROMPT),
        /diamond/i.test(metalType ?? ''),
      );
      if (LOOKS.size >= LOOK_CACHE_SIZE) LOOKS.delete(LOOKS.keys().next().value as string);
      LOOKS.set(key, look);
      return look;
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'Could not read the product photo for the ad script');
      return {};
    }
  }

  private async businessName(userId: string): Promise<string | null> {
    try {
      const name = await this.catalog.businessName(userId);
      return name?.trim() || null;
    } catch {
      return null;
    }
  }

  private async saveBrand(
    userId: string,
    businessName: string,
    patch: { spokenName: string | null; spokenNameFor: string | null; spokenNameByUser: boolean },
  ): Promise<void> {
    const brand = await this.brands.find(userId);
    await this.brands.upsert(
      brand
        ? { userId, ...patch }
        : {
            userId,
            businessName: businessName || 'Jewellers',
            logoImageStatus: EAssetStatus.Pending,
            logoVideoStatus: EAssetStatus.Pending,
            ...patch,
          },
    );
  }

  async list(userId: string): Promise<VoiceoverView[]> {
    const list = await this.voiceovers.listForUser(userId, LIST_LIMIT);
    const jobs = await this.jobs.latestForVoiceovers(list.map((v) => v.id));
    return Promise.all(
      list.map((v) =>
        this.view(
          v,
          jobs.find((j) => j.payload.voice?.voiceoverId === v.id),
        ),
      ),
    );
  }

  async get(userId: string, id: string): Promise<VoiceoverView> {
    const voiceover = await this.owned(userId, id);
    const [job] = await this.jobs.latestForVoiceovers([voiceover.id]);
    return this.view(voiceover, job);
  }

  async remove(userId: string, id: string): Promise<void> {
    const voiceover = await this.owned(userId, id);
    if (voiceover.status === String(EVoiceoverStatus.Generating)) {
      throw new BadRequestException('This voiceover is being made right now. Delete it once it finishes.');
    }
    const shared = (await this.voiceovers.listForUser(userId, 500)).some(
      (other) => other.id !== id && other.sampleKey === voiceover.sampleKey,
    );
    const keys = [voiceover.audioKey, shared ? null : voiceover.sampleKey].filter((k): k is string => !!k);
    await Promise.all(keys.map((k) => this.storage.removeAsync(k).catch(() => false)));
    await this.voiceovers.delete(id);
  }

  /** A new take: same text and voice, new seed unless one is given (settings may be changed). */
  async regenerate(userId: string, id: string, settings?: Partial<VoiceoverSettings>): Promise<VoiceoverView> {
    const voiceover = await this.owned(userId, id);
    if (voiceover.status === String(EVoiceoverStatus.Generating))
      throw new BadRequestException('It is already being made.');
    const next: VoiceoverSettings = {
      ...voiceover.settings,
      ...Object.fromEntries(Object.entries(settings ?? {}).filter(([, v]) => typeof v === 'number')),
      seed: typeof settings?.seed === 'number' ? settings.seed : randomInt(0, 2 ** 31),
    };
    await this.voiceovers.update(id, { settings: next, status: EVoiceoverStatus.Generating, error: null });
    await this.render.queueVoiceover(id);
    await this.events.voiceover(userId, id, true);
    return this.get(userId, id);
  }

  private async owned(userId: string, id: string): Promise<Voiceover> {
    const voiceover = await this.voiceovers.findForUser(id, userId);
    if (!voiceover) throw new NotFoundException('Voiceover not found');
    return voiceover;
  }

  private url(key?: string | null): Promise<string | undefined> {
    return key
      ? this.storage
          .getUrlAsync(key)
          .then((u) => u ?? undefined)
          .catch(() => undefined)
      : Promise.resolve(undefined);
  }

  private async view(voiceover: Voiceover, job?: RenderJob): Promise<VoiceoverView> {
    const { sampleKey, audioKey, userId: _owner, ...rest } = voiceover;
    void _owner;
    return {
      ...rest,
      audioUrl: voiceover.status === String(EVoiceoverStatus.Ready) ? await this.url(audioKey) : undefined,
      sampleUrl: await this.url(sampleKey),
      voiceJob: job ? kaggleJobStatus(job) : null,
    };
  }
}
