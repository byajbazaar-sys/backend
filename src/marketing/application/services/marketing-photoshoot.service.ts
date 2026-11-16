import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { Photoshoot, PhotoshootPiece, PhotoshootShot } from '../domain';
import {
  EAssetStatus,
  EPhotoshootStatus,
  PHOTOSHOOT_ASPECTS,
  PHOTOSHOOT_MODELS,
  PHOTOSHOOT_OUTFITS,
  PHOTOSHOOT_SETTINGS,
  PhotoshootAspect,
  PhotoshootModel,
  PhotoshootOutfit,
  PhotoshootSetting,
} from '../enums';
import {
  IMarketingAi,
  IMarketingCatalog,
  IMarketingFileStorage,
  IMarketingNotifier,
  IMarketingPhotoshootShotsRepository,
  IMarketingPhotoshootsRepository,
  MARKETING_AI,
  MARKETING_CATALOG,
  MARKETING_FILE_STORAGE,
  MARKETING_NOTIFIER,
  MARKETING_PHOTOSHOOT_SHOTS_REPOSITORY,
  MARKETING_PHOTOSHOOTS_REPOSITORY,
} from '../ports';
import { MarketingScheduler } from './marketing-scheduler';
import { buildShotPrompt, describePiece, PHOTOSHOOT_SHOT_KINDS } from '../prompts/photoshoot.prompts';

const MAX_ACTIVE_PER_USER = 3;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOAD_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const LIST_LIMIT = 40;

const keys = {
  source: (userId: string, id: string, ext: string) => `photoshoots/${userId}/${id}/source.${ext}`,
  shot: (userId: string, id: string, index: number) => `photoshoots/${userId}/${id}/shot-${index}-${Date.now()}.jpg`,
};

export interface CreatePhotoshootInput {
  inventoryItemId?: string;
  image?: { base64: string; mimeType: string };
  title?: string;
  /** For uploads (or to correct an item): what the piece is, e.g. "necklace", "earrings", "kada". */
  pieceType?: string;
  /** gold | silver | rose_gold | platinum | diamond (defaults to the item's metal). */
  metal?: string;
  setting?: string;
  model?: string;
  outfit?: string;
  aspect?: string;
}

export interface PhotoshootShotView {
  index: number;
  kind: string;
  status: string;
  imageUrl?: string;
  error?: string | null;
}

export interface PhotoshootView extends Omit<Photoshoot, 'sourceImageKey'> {
  sourceImageUrl?: string;
  shots: PhotoshootShotView[];
}

/** Statuses are stored as plain strings. */
const is = (value: string, status: string): boolean => value === status;

const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;

/**
 * AI photoshoots: one product photo → 4 ad photos (presented by a model, close-up on velvet, gloved hands, worn) with
 * the existing Cloudflare FLUX image model. Runs as a queue step on the worker Lambda; each finished photo is pushed
 * to the user's open sessions.
 */
@Injectable()
export class MarketingPhotoshootService {
  constructor(
    @Inject(MARKETING_PHOTOSHOOTS_REPOSITORY) private readonly shoots: IMarketingPhotoshootsRepository,
    @Inject(MARKETING_PHOTOSHOOT_SHOTS_REPOSITORY) private readonly shots: IMarketingPhotoshootShotsRepository,
    @Inject(MARKETING_FILE_STORAGE) private readonly storage: IMarketingFileStorage,
    @Inject(MARKETING_CATALOG) private readonly catalog: IMarketingCatalog,
    @Inject(MARKETING_AI) private readonly ai: IMarketingAi,
    @Inject(MARKETING_NOTIFIER) private readonly notifier: IMarketingNotifier,
    private readonly scheduler: MarketingScheduler,
    @InjectPinoLogger(MarketingPhotoshootService.name) private readonly logger: PinoLogger,
  ) {}

  // ---------------------------------------------------------------- API

  async create(userId: string, input: CreatePhotoshootInput): Promise<PhotoshootView> {
    if (!input.inventoryItemId && !input.image?.base64) {
      throw new BadRequestException('Choose an inventory item or upload a photo.');
    }
    if ((await this.shoots.countActiveForUser(userId)) >= MAX_ACTIVE_PER_USER) {
      throw new BadRequestException(
        `You can have ${MAX_ACTIVE_PER_USER} photoshoots in progress at a time. Try again in a minute.`,
      );
    }
    const setting = pick<PhotoshootSetting>(input.setting, PHOTOSHOOT_SETTINGS, 'showroom');
    const model = pick<PhotoshootModel>(input.model, PHOTOSHOOT_MODELS, 'woman');
    const outfit = pick<PhotoshootOutfit>(input.outfit, PHOTOSHOOT_OUTFITS, 'kurta');
    const aspect = pick<PhotoshootAspect>(input.aspect, Object.keys(PHOTOSHOOT_ASPECTS) as PhotoshootAspect[], '3:4');

    let image: { data: Buffer; ext: string };
    let title: string;
    let inventoryItemId: string | null = null;
    let piece: PhotoshootPiece;
    if (input.inventoryItemId) {
      const item = await this.catalog.findItem(userId, input.inventoryItemId);
      if (!item) throw new NotFoundException('Inventory item not found');
      if (!item.imageKey)
        throw new BadRequestException('This item has no photo yet. Add one or upload a photo instead.');
      const data = await this.catalog.readImage(item.imageKey);
      if (!data?.length)
        throw new BadRequestException("This item's photo could not be loaded. Upload a photo instead.");
      image = { data, ext: 'png' }; // the storage corrects the extension to the real image type
      title = input.title?.trim() || item.itemName;
      inventoryItemId = item.id;
      piece = describePiece({
        name: [input.pieceType, item.itemName].filter(Boolean).join(' '),
        category: item.categoryName,
        metal: input.metal ?? item.metalType,
        purity: item.purity,
      });
    } else {
      const ext = UPLOAD_TYPES[input.image.mimeType];
      if (!ext) throw new BadRequestException('Upload a JPG, PNG or WEBP photo.');
      const data = Buffer.from(input.image.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (!data.length || data.length > MAX_UPLOAD_BYTES)
        throw new BadRequestException('The photo must be under 8 MB.');
      image = { data, ext };
      title = input.title?.trim() || 'Jewellery';
      piece = describePiece({ name: [input.pieceType, title].filter(Boolean).join(' '), metal: input.metal });
    }

    const shoot = await this.shoots.create({
      userId,
      title: title.slice(0, 255),
      inventoryItemId,
      sourceImageKey: '',
      piece,
      setting,
      model,
      outfit,
      aspect,
      status: EPhotoshootStatus.Generating,
    });
    try {
      const sourceImageKey = await this.storage.writeAsync(
        keys.source(userId, shoot.id, image.ext),
        image.data,
        `image/${image.ext === 'jpg' ? 'jpeg' : image.ext}`,
      );
      await this.shoots.update(shoot.id, { sourceImageKey });
    } catch (err) {
      await this.shoots.delete(shoot.id);
      throw err;
    }
    await this.shots.createMany(
      PHOTOSHOOT_SHOT_KINDS.map((kind, index) => ({
        photoshootId: shoot.id,
        index,
        kind,
        prompt: buildShotPrompt(kind, piece, { setting, model, outfit }),
        imageKey: null,
        status: EAssetStatus.Pending,
      })),
    );
    await this.scheduler.schedule({ step: 'photoshoot', photoshootId: shoot.id });
    await this.notify(shoot);
    return this.get(userId, shoot.id);
  }

  async list(userId: string): Promise<PhotoshootView[]> {
    const list = await this.shoots.listForUser(userId, LIST_LIMIT);
    const shots = await this.shots.listFor(list.map((s) => s.id));
    return Promise.all(
      list.map((s) =>
        this.view(
          s,
          shots.filter((x) => x.photoshootId === s.id),
        ),
      ),
    );
  }

  async get(userId: string, id: string): Promise<PhotoshootView> {
    const shoot = await this.owned(userId, id);
    return this.view(shoot, await this.shots.listFor([shoot.id]));
  }

  async remove(userId: string, id: string): Promise<void> {
    const shoot = await this.owned(userId, id);
    const shots = await this.shots.listFor([shoot.id]);
    await Promise.all(
      [shoot.sourceImageKey, ...shots.map((s) => s.imageKey)]
        .filter((k): k is string => !!k)
        .map((k) => this.storage.removeAsync(k).catch(() => false)),
    );
    await this.shoots.delete(shoot.id); // shots cascade
  }

  /** New take of one photo (new seed, same brief). */
  async regenerateShot(userId: string, id: string, index: number): Promise<PhotoshootView> {
    const shoot = await this.owned(userId, id);
    const shot = await this.shots.findByIndex(shoot.id, index);
    if (!shot) throw new NotFoundException('Photo not found');
    if (is(shot.status, EAssetStatus.Generating)) throw new BadRequestException('This photo is already being made.');
    await this.shots.update(shot.id, { status: EAssetStatus.Pending, error: null });
    const updated = await this.shoots.update(shoot.id, { status: EPhotoshootStatus.Generating, error: null });
    await this.scheduler.schedule({ step: 'photoshoot', photoshootId: shoot.id, shotIndex: index });
    if (updated) await this.notify(updated);
    return this.get(userId, id);
  }

  // ---------------------------------------------------------------- worker step

  /** Generates the shoot's pending photos (or just `onlyIndex`), in parallel, then settles the shoot. */
  async run(photoshootId: string, onlyIndex?: number): Promise<void> {
    const shoot = await this.shoots.findById(photoshootId);
    if (!shoot) return;
    const all = await this.shots.listFor([shoot.id]);
    const todo = all.filter((s) =>
      typeof onlyIndex === 'number' ? s.index === onlyIndex : !is(s.status, EAssetStatus.Ready),
    );
    try {
      const source = shoot.sourceImageKey ? await this.storage.readAsync(shoot.sourceImageKey) : null;
      if (!source?.length) throw new Error('The product photo could not be found. Please start a new photoshoot.');
      const size = PHOTOSHOOT_ASPECTS[shoot.aspect as PhotoshootAspect] ?? PHOTOSHOOT_ASPECTS['3:4'];
      await Promise.all(todo.map((shot) => this.generateShot(shoot, shot, source, size)));
    } catch (err) {
      const message = (err as Error).message.slice(0, 500);
      await Promise.all(todo.map((s) => this.shots.update(s.id, { status: EAssetStatus.Failed, error: message })));
      this.logger.warn({ photoshootId, err: message }, 'Photoshoot failed');
    }
    await this.settle(shoot.id);
  }

  private async generateShot(
    shoot: Photoshoot,
    shot: PhotoshootShot,
    source: Buffer,
    size: { width: number; height: number },
  ): Promise<void> {
    await this.shots.update(shot.id, { status: EAssetStatus.Generating, error: null });
    try {
      const image = await this.ai.imageToImage(
        { base64: source.toString('base64'), mimeType: 'image/png' },
        shot.prompt,
        size,
      );
      // writeAsync stores under the real image type's extension and returns that key.
      const key = await this.storage.writeAsync(
        keys.shot(shoot.userId, shoot.id, shot.index),
        Buffer.from(image.base64, 'base64'),
        image.mimeType || 'image/jpeg',
      );
      if (shot.imageKey && shot.imageKey !== key) await this.storage.removeAsync(shot.imageKey).catch(() => false);
      await this.shots.update(shot.id, { imageKey: key, status: EAssetStatus.Ready, error: null });
    } catch (err) {
      this.logger.warn(
        { photoshootId: shoot.id, shot: shot.index, err: (err as Error).message },
        'Photoshoot photo failed',
      );
      await this.shots.update(shot.id, {
        status: EAssetStatus.Failed,
        error: `${(err as Error).message}`.slice(0, 500),
      });
    }
    await this.notify(shoot); // each photo appears as soon as it is ready
  }

  private async settle(photoshootId: string): Promise<void> {
    const shots = await this.shots.listFor([photoshootId]);
    if (shots.some((s) => is(s.status, EAssetStatus.Generating) || is(s.status, EAssetStatus.Pending))) return;
    const ready = shots.filter((s) => is(s.status, EAssetStatus.Ready)).length;
    const status =
      ready === shots.length
        ? EPhotoshootStatus.Ready
        : ready > 0
          ? EPhotoshootStatus.Partial
          : EPhotoshootStatus.Failed;
    const error = is(status, EPhotoshootStatus.Ready) ? null : (shots.find((s) => s.error)?.error ?? null);
    const updated = await this.shoots.update(photoshootId, { status, error });
    if (updated) await this.notify(updated);
  }

  // ---------------------------------------------------------------- helpers

  private async owned(userId: string, id: string): Promise<Photoshoot> {
    const shoot = await this.shoots.findForUser(id, userId);
    if (!shoot) throw new NotFoundException('Photoshoot not found');
    return shoot;
  }

  private url(key?: string | null): Promise<string | undefined> {
    return key
      ? this.storage
          .getUrlAsync(key)
          .then((u) => u ?? undefined)
          .catch(() => undefined)
      : Promise.resolve(undefined);
  }

  private async view(shoot: Photoshoot, shots: PhotoshootShot[]): Promise<PhotoshootView> {
    const { sourceImageKey, ...rest } = shoot;
    return {
      ...rest,
      sourceImageUrl: await this.url(sourceImageKey),
      shots: await Promise.all(
        shots
          .sort((a, b) => a.index - b.index)
          .map(async (s) => ({
            index: s.index,
            kind: s.kind,
            status: s.status,
            error: s.error,
            imageUrl: is(s.status, EAssetStatus.Ready) ? await this.url(s.imageKey) : undefined,
          })),
      ),
    };
  }

  private notify(shoot: Photoshoot): Promise<void> {
    return this.notifier.notifyUser(shoot.userId, {
      type: 'marketingPhotoshootUpdated',
      photoshoot: { id: shoot.id, status: shoot.status },
      refresh: true,
      timestamp: new Date().toISOString(),
    });
  }
}
