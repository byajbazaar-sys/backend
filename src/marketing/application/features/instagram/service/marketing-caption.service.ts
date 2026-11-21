import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import sharp from 'sharp';

import { MarketingPublishingService } from './marketing-publishing.service';
import { ScheduleMarketingPostItemInput } from './schedule-marketing-post-input';
import {
  IMarketingCampaignsRepository,
  IMarketingCatalog,
  IMarketingFileStorage,
  IMarketingPhotoshootsRepository,
  IMarketingScenesRepository,
  IMarketingTextWriter,
  MARKETING_CAMPAIGNS_REPOSITORY,
  MARKETING_CATALOG,
  MARKETING_FILE_STORAGE,
  MARKETING_PHOTOSHOOTS_REPOSITORY,
  MARKETING_SCENES_REPOSITORY,
  MARKETING_TEXT_WRITER,
} from '../../../shared';
import {
  CAPTION_LOOK_PROMPT,
  CaptionFacts,
  CaptionLanguage,
  CaptionPiece,
  CaptionTone,
  Occasion,
  captionPrompt,
  occasionsFor,
  parseCaption,
  parseCaptionLook,
  templateCaption,
} from '../utils';

/** Photos the vision model looks at per caption (the rest of a carousel is described by its facts). */
const MAX_LOOKS = 3;
const LOOKS = new Map<string, string | undefined>();
const LOOK_CACHE_SIZE = 300;

export interface CaptionRequest {
  items: ScheduleMarketingPostItemInput[];
  language: CaptionLanguage;
  tone?: CaptionTone;
  /** When the post goes out: picks the special day. Defaults to now. */
  scheduledAt?: string;
  /** 'auto' finds a special day for the post date; 'none' mentions none; 'custom' uses `occasionText`. */
  occasion?: 'auto' | 'none' | 'custom';
  occasionText?: string;
}

export interface CaptionView {
  caption: string;
  hashtags: string[];
  /** Caption, a blank line, then the hashtags — ready to paste. */
  text: string;
  language: CaptionLanguage;
  /** The special day the caption mentions, if any. */
  occasion: string | null;
  /** Special days that apply to the post date (for the picker). */
  occasions: string[];
  /** 'ai' from the text model; 'template' when no model answered. */
  source: 'ai' | 'template';
}

/**
 * Instagram captions written by the marketing text model (Workers AI) from what the photos show (vision model),
 * the pieces' inventory facts, the shop's name and location, and the special day the post goes out on.
 */
@Injectable()
export class MarketingCaptionService {
  constructor(
    private readonly publishing: MarketingPublishingService,
    @Inject(MARKETING_CAMPAIGNS_REPOSITORY) private readonly campaigns: IMarketingCampaignsRepository,
    @Inject(MARKETING_PHOTOSHOOTS_REPOSITORY) private readonly photoshoots: IMarketingPhotoshootsRepository,
    @Inject(MARKETING_SCENES_REPOSITORY) private readonly scenes: IMarketingScenesRepository,
    @Inject(MARKETING_FILE_STORAGE) private readonly storage: IMarketingFileStorage,
    @Inject(MARKETING_CATALOG) private readonly catalog: IMarketingCatalog,
    @Inject(MARKETING_TEXT_WRITER) private readonly writer: IMarketingTextWriter,
    @InjectPinoLogger(MarketingCaptionService.name) private readonly logger: PinoLogger,
  ) {}

  async write(userId: string, request: CaptionRequest): Promise<CaptionView> {
    const at = request.scheduledAt ? new Date(request.scheduledAt) : new Date();
    const found = occasionsFor(Number.isFinite(at.getTime()) ? at : new Date());
    const occasion: Occasion | null =
      request.occasion === 'none'
        ? null
        : request.occasion === 'custom'
          ? request.occasionText?.trim()
            ? { name: request.occasionText.trim().slice(0, 80), angle: 'a special day for the shop', kind: 'day' }
            : null
          : (found[0] ?? null);

    const facts = await this.facts(userId, request.items, occasion);
    const tone = request.tone ?? (occasion?.kind === 'festival' ? 'festive' : 'elegant');

    let result = null;
    for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
      try {
        const { system, user } = captionPrompt(facts, request.language, tone);
        result = parseCaption(await this.writer.write(system, user, { temperature: 0.85, maxTokens: 800 }), facts);
      } catch (err) {
        this.logger.warn({ err: (err as Error).message }, 'Caption model did not answer');
        break;
      }
    }
    const source = result ? 'ai' : 'template';
    result ??= templateCaption(facts, request.language);
    return {
      caption: result.caption,
      hashtags: result.hashtags,
      text: `${result.caption}\n\n${result.hashtags.join(' ')}`.slice(0, 2200),
      language: request.language,
      occasion: occasion?.name ?? null,
      occasions: found.map((o) => o.name),
      source,
    };
  }

  private async facts(
    userId: string,
    items: ScheduleMarketingPostItemInput[],
    occasion: Occasion | null,
  ): Promise<CaptionFacts> {
    const profile = await this.catalog
      .businessProfile(userId)
      .catch(() => ({ name: null, address: null, state: null }));
    const pieces: CaptionPiece[] = [];
    const seenSources = new Set<string>();
    let looked = 0;

    for (const item of items) {
      // Ownership + readiness check; also gives the photo to look at.
      const { assetKey } = await this.publishing.resolveSource(userId, item);
      const sourceKey = `${item.sourceType}:${item.sourceId}`;
      const firstOfSource = !seenSources.has(sourceKey);
      seenSources.add(sourceKey);

      const piece = firstOfSource ? await this.pieceFor(userId, item) : null;
      if (looked < MAX_LOOKS && (firstOfSource || pieces.length === 0)) {
        const imageKey = item.mediaType === 'IMAGE' ? assetKey : await this.reelStill(item);
        const look = imageKey ? await this.look(imageKey, /diamond/i.test(piece?.metal ?? '')) : undefined;
        looked += 1;
        if (piece) piece.look = look;
        else if (look && pieces[0] && !pieces[0].look) pieces[0].look = look;
      }
      if (piece) pieces.push(piece);
    }

    return {
      shopName: profile.name,
      address: profile.address,
      state: profile.state,
      pieces: pieces.slice(0, 5),
      mediaCount: items.length,
      hasVideo: items.some((i) => i.mediaType === 'REEL'),
      occasion,
    };
  }

  /** The piece behind a campaign / photoshoot: its inventory item's facts, else the photoshoot's own description. */
  private async pieceFor(userId: string, item: ScheduleMarketingPostItemInput): Promise<CaptionPiece | null> {
    const source =
      item.sourceType === 'campaign'
        ? await this.campaigns.findForUser(item.sourceId, userId)
        : await this.photoshoots.findForUser(item.sourceId, userId);
    if (!source) return null;
    if (source.inventoryItemId) {
      const inv = await this.catalog.findItem(userId, source.inventoryItemId).catch(() => null);
      if (inv) {
        return {
          name: inv.itemName,
          category: inv.categoryName,
          metal: inv.metalType && inv.metalType !== 'OTHER' ? titleCase(String(inv.metalType)) : undefined,
          purity: inv.purity,
          weightGrams: inv.netWeight ?? inv.grossWeight,
          hallmarked: inv.hallmarked,
        };
      }
    }
    if ('piece' in source && source.piece) {
      return {
        name: source.title || source.piece.noun,
        category: source.piece.noun,
        metal: source.piece.metal || undefined,
      };
    }
    return { name: source.title };
  }

  /** A reel's still: the scene image it was animated from. */
  private async reelStill(item: ScheduleMarketingPostItemInput): Promise<string | null> {
    if (item.sourceType !== 'campaign' || item.sourceIndex === undefined) return null;
    return (await this.scenes.findByIndex(item.sourceId, item.sourceIndex))?.imageKey ?? null;
  }

  /** What the photo shows, in a few English words (cached per photo). Optional: no vision model → no look. */
  private async look(imageKey: string, diamond: boolean): Promise<string | undefined> {
    if (LOOKS.has(imageKey)) return LOOKS.get(imageKey);
    try {
      const photo = await sharp(await this.storage.readAsync(imageKey))
        .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      const look = parseCaptionLook(await this.writer.see(photo, CAPTION_LOOK_PROMPT), diamond);
      if (LOOKS.size >= LOOK_CACHE_SIZE) LOOKS.delete(LOOKS.keys().next().value as string);
      LOOKS.set(imageKey, look);
      return look;
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'Could not read the post photo for the caption');
      return undefined;
    }
  }
}

const titleCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
