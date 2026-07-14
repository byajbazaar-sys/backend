import { randomUUID } from 'crypto';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { normalizeImageBufferForStorageOrThrow } from '@shared-libs';
import { IUsersFileStorage, ITryOnAiService, TRY_ON_AI_SERVICE, USERS_FILE_STORAGE } from '../../shared';
import type {
  GeneratedImage,
  JewelleryTryOnRequest,
  OutfitRecolorRequest,
  TryOnJobRecord,
} from './types';
import type {
  CreateTryOnJobRequestModel,
  RecolorTryOnRequestModel,
  TryOnAssetResponseModel,
  TryOnAssetType,
} from './models';
import { TRY_ON_ASSET_TYPES } from './models';

export const TRY_ON_SERVICE = 'TRY_ON_SERVICE';

export interface TryOnAssetRecord {
  id: string;
  userId: string;
  type: TryOnAssetType;
  imageKey: string;
  label?: string;
  heightInInches?: number;
  color?: string;
  createdAt: string;
}

export interface UploadTryOnAssetInput {
  type: string;
  label?: string;
  heightInInches?: number;
  color?: string;
  file: Express.Multer.File;
}

export interface ITryOnService {
  startTryOnJob(userId: string, body: CreateTryOnJobRequestModel): Promise<TryOnJobRecord>;
  startRecolorJob(userId: string, body: RecolorTryOnRequestModel): Promise<TryOnJobRecord>;
  getJob(userId: string, jobId: string): Promise<TryOnJobRecord>;
  processJob(payload: TryOnLambdaPayload): Promise<TryOnJobRecord>;
  uploadAsset(userId: string, input: UploadTryOnAssetInput): Promise<TryOnAssetResponseModel>;
  listAssets(userId: string, type?: string): Promise<TryOnAssetResponseModel[]>;
  deleteAsset(userId: string, assetId: string): Promise<void>;
}

export interface TryOnLambdaPayload {
  jobId: string;
  userId: string;
  mode: 'jewellery' | 'outfit' | 'recolor';
  request: JewelleryTryOnRequest | OutfitRecolorRequest;
  variations: number;
}

function jobMetaKey(userId: string, jobId: string): string {
  return `try-on/${userId}/${jobId}/meta.json`;
}

function assetMetaKey(userId: string, assetId: string): string {
  return `try-on/assets/${userId}/${assetId}/meta.json`;
}

function assetIndexKey(userId: string): string {
  return `try-on/assets/${userId}/index.json`;
}

function assetImageKey(userId: string, assetId: string, ext: string): string {
  return `try-on/assets/${userId}/${assetId}/image.${ext}`;
}

@Injectable()
export class TryOnService implements ITryOnService {
  private lambdaClient: LambdaClient | null = null;

  constructor(
    @Inject(TRY_ON_AI_SERVICE) private readonly tryOnAi: ITryOnAiService,
    @Inject(USERS_FILE_STORAGE) private readonly fileStorage: IUsersFileStorage,
    @InjectPinoLogger(TryOnService.name) private readonly logger: PinoLogger,
  ) {}

  private getLambda(): LambdaClient {
    if (!this.lambdaClient) {
      this.lambdaClient = new LambdaClient({
        region: process.env.LAMBDA_AWS_REGION || process.env.AWS_REGION || 'ap-south-1',
        ...(process.env.LAMBDA_AWS_ACCESS_KEY_ID
          ? {
              credentials: {
                accessKeyId: process.env.LAMBDA_AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.LAMBDA_AWS_SECRET_ACCESS_KEY || '',
              },
            }
          : {}),
      });
    }
    return this.lambdaClient;
  }

  private async writeJob(record: TryOnJobRecord): Promise<void> {
    const key = jobMetaKey(record.userId, record.jobId);
    await this.fileStorage.writeAsync(
      key,
      Buffer.from(JSON.stringify(record), 'utf8'),
      'application/json',
    );
  }

  private async readJob(userId: string, jobId: string): Promise<TryOnJobRecord | null> {
    try {
      const buf = await this.fileStorage.readAsync(jobMetaKey(userId, jobId));
      return JSON.parse(buf.toString('utf8')) as TryOnJobRecord;
    } catch {
      return null;
    }
  }

  private async readAssetIndex(userId: string): Promise<TryOnAssetRecord[]> {
    try {
      const buf = await this.fileStorage.readAsync(assetIndexKey(userId));
      const parsed = JSON.parse(buf.toString('utf8')) as { items?: TryOnAssetRecord[] };
      return Array.isArray(parsed.items) ? parsed.items : [];
    } catch {
      return [];
    }
  }

  private async writeAssetIndex(userId: string, items: TryOnAssetRecord[]): Promise<void> {
    await this.fileStorage.writeAsync(
      assetIndexKey(userId),
      Buffer.from(JSON.stringify({ items }), 'utf8'),
      'application/json',
    );
  }

  private async toAssetResponse(record: TryOnAssetRecord): Promise<TryOnAssetResponseModel> {
    const imageUrl = (await this.fileStorage.getUrlAsync(record.imageKey)) ?? record.imageKey;
    return {
      id: record.id,
      type: record.type,
      imageUrl,
      imageKey: record.imageKey,
      label: record.label,
      heightInInches: record.heightInInches,
      color: record.color,
      createdAt: record.createdAt,
    };
  }

  async uploadAsset(userId: string, input: UploadTryOnAssetInput): Promise<TryOnAssetResponseModel> {
    const type = (input.type || '').trim().toLowerCase() as TryOnAssetType;
    if (!TRY_ON_ASSET_TYPES.includes(type)) {
      throw new BadRequestException(`type must be one of: ${TRY_ON_ASSET_TYPES.join(', ')}`);
    }
    if (!input.file?.buffer?.length) {
      throw new BadRequestException('image file is required');
    }

    let heightInInches = input.heightInInches;
    if (heightInInches != null) {
      if (Number.isNaN(heightInInches) || heightInInches < 0.1 || heightInInches > 24) {
        throw new BadRequestException('heightInInches must be between 0.1 and 24');
      }
    }

    const label = input.label?.trim() || undefined;
    if ((type === 'outfit' || type === 'occasion') && !label) {
      throw new BadRequestException(`label is required for custom ${type} uploads`);
    }

    const color = input.color?.trim() || undefined;
    const assetId = randomUUID();
    const normalized = await normalizeImageBufferForStorageOrThrow(
      input.file.buffer,
      input.file.mimetype,
      input.file.originalname,
    );
    const proposedKey = assetImageKey(userId, assetId, normalized.fileExtension);
    const imageKey = await this.fileStorage.writeAsync(
      proposedKey,
      normalized.buffer,
      normalized.mimetype,
    );

    const record: TryOnAssetRecord = {
      id: assetId,
      userId,
      type,
      imageKey,
      label,
      heightInInches,
      color,
      createdAt: new Date().toISOString(),
    };

    await this.fileStorage.writeAsync(
      assetMetaKey(userId, assetId),
      Buffer.from(JSON.stringify(record), 'utf8'),
      'application/json',
    );

    const index = await this.readAssetIndex(userId);
    index.unshift(record);
    await this.writeAssetIndex(userId, index);

    this.logger.info({ userId, assetId, type }, 'Try-on asset uploaded');
    return this.toAssetResponse(record);
  }

  async listAssets(userId: string, type?: string): Promise<TryOnAssetResponseModel[]> {
    const filter = type?.trim().toLowerCase();
    let items = await this.readAssetIndex(userId);
    if (filter) {
      items = items.filter((item) => item.type === filter);
    }
    return Promise.all(items.map((item) => this.toAssetResponse(item)));
  }

  async deleteAsset(userId: string, assetId: string): Promise<void> {
    const index = await this.readAssetIndex(userId);
    const existing = index.find((item) => item.id === assetId);
    if (!existing) {
      throw new NotFoundException('Try-on asset not found');
    }

    try {
      await this.fileStorage.removeAsync(existing.imageKey);
    } catch (err) {
      this.logger.warn({ err, imageKey: existing.imageKey }, 'Failed to remove asset image');
    }
    try {
      await this.fileStorage.removeAsync(assetMetaKey(userId, assetId));
    } catch {
      /* ignore */
    }

    await this.writeAssetIndex(
      userId,
      index.filter((item) => item.id !== assetId),
    );
    this.logger.info({ userId, assetId }, 'Try-on asset deleted');
  }

  private validateImages(body: CreateTryOnJobRequestModel): void {
    if (!body.personImage?.base64) {
      throw new BadRequestException('personImage is required');
    }
    if (!body.jewelleryItems?.length) {
      throw new BadRequestException('At least one jewellery item is required');
    }
    if (!body.outfit?.trim()) {
      throw new BadRequestException('outfit is required and must be a non-empty string');
    }
  }

  async startTryOnJob(userId: string, body: CreateTryOnJobRequestModel): Promise<TryOnJobRecord> {
    this.validateImages(body);
    const mode = 'outfit';
    const variations = Math.min(2, Math.max(1, body.variations ?? 2));
    const jobId = randomUUID();
    const now = new Date().toISOString();
    const record: TryOnJobRecord = {
      jobId,
      userId,
      status: 'PENDING',
      mode,
      createdAt: now,
      updatedAt: now,
    };
    await this.writeJob(record);

    const request: JewelleryTryOnRequest = {
      personImage: body.personImage,
      jewelleryItems: body.jewelleryItems,
      outfit: body.outfit.trim(),
      occasion: body.occasion,
      color: body.color,
      variations,
    };

    const payload: TryOnLambdaPayload = {
      jobId,
      userId,
      mode,
      request,
      variations,
    };

    await this.dispatchJob(payload);
    return record;
  }

  async startRecolorJob(userId: string, body: RecolorTryOnRequestModel): Promise<TryOnJobRecord> {
    if (!body.image?.base64 || !body.color?.trim()) {
      throw new BadRequestException('image and color are required');
    }
    const jobId = randomUUID();
    const now = new Date().toISOString();
    const record: TryOnJobRecord = {
      jobId,
      userId,
      status: 'PENDING',
      mode: 'recolor',
      createdAt: now,
      updatedAt: now,
    };
    await this.writeJob(record);

    const payload: TryOnLambdaPayload = {
      jobId,
      userId,
      mode: 'recolor',
      request: { image: body.image, color: body.color.trim() },
      variations: 1,
    };
    await this.dispatchJob(payload);
    return record;
  }

  private async dispatchJob(payload: TryOnLambdaPayload): Promise<void> {
    const functionName = process.env.TRY_ON_LAMBDA_NAME?.trim();
    if (functionName && process.env.TRY_ON_INLINE !== 'true') {
      try {
        await this.getLambda().send(
          new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'Event',
            Payload: Buffer.from(JSON.stringify(payload)),
          }),
        );
        this.logger.info({ jobId: payload.jobId, functionName }, 'Dispatched try-on Lambda');
        return;
      } catch (err) {
        this.logger.warn({ err }, 'Lambda invoke failed — running try-on inline');
      }
    }
    void this.processJob(payload).catch((err) => {
      this.logger.error({ err, jobId: payload.jobId }, 'Inline try-on job failed');
    });
  }

  async getJob(userId: string, jobId: string): Promise<TryOnJobRecord> {
    const record = await this.readJob(userId, jobId);
    if (!record || record.userId !== userId) {
      throw new NotFoundException('Try-on job not found');
    }
    return record;
  }

  async processJob(payload: TryOnLambdaPayload): Promise<TryOnJobRecord> {
    const existing = await this.readJob(payload.userId, payload.jobId);
    const base: TryOnJobRecord = existing ?? {
      jobId: payload.jobId,
      userId: payload.userId,
      status: 'PENDING',
      mode: payload.mode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const images: GeneratedImage[] = [];
      if (payload.mode === 'recolor') {
        const req = payload.request as OutfitRecolorRequest;
        images.push(await this.tryOnAi.recolorOutfit(req));
      } else {
        const req = payload.request as JewelleryTryOnRequest;
        const mode = payload.mode === 'outfit' ? 'outfit' : 'jewellery';
        if (typeof this.tryOnAi.generateTryOnImages === 'function') {
          const generated = await this.tryOnAi.generateTryOnImages(req, mode);
          images.push(...generated);
        } else {
          const count = Math.min(2, Math.max(1, payload.variations || 1));
          for (let i = 0; i < count; i++) {
            const image =
              mode === 'outfit'
                ? await this.tryOnAi.generateOutfitTryOn(req)
                : await this.tryOnAi.generateJewelleryTryOn(req);
            images.push(image);
          }
        }
      }

      const completed: TryOnJobRecord = {
        ...base,
        status: 'COMPLETED',
        images,
        error: undefined,
        updatedAt: new Date().toISOString(),
      };
      await this.writeJob(completed);
      this.logger.info({ jobId: payload.jobId, count: images.length }, 'Try-on job completed');
      return completed;
    } catch (err) {
      const failed: TryOnJobRecord = {
        ...base,
        status: 'FAILED',
        error: err instanceof Error ? err.message : String(err),
        updatedAt: new Date().toISOString(),
      };
      await this.writeJob(failed);
      this.logger.error({ err, jobId: payload.jobId }, 'Try-on job failed');
      return failed;
    }
  }
}
