import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeImageBufferForStorageOrThrow } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { randomUUID } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { TryOnAsset, CreateTryOnAssetData } from './domain';
import type { GeneratedImage, JewelleryTryOnRequest, OutfitRecolorRequest, TryOnJobRecord } from './interfaces';
import type {
  CreateTryOnJobRequestModel,
  RecolorTryOnRequestModel,
  TryOnAssetResponseModel,
  TryOnAssetType,
} from './models';
import { TRY_ON_ASSET_TYPES } from './models';
import { ITryOnAssetsRepository, TRY_ON_ASSETS_REPOSITORY } from './service';
import {
  IUsersFileStorage,
  ITryOnAiService,
  ITryOnOrchestrator,
  TRY_ON_AI_SERVICE,
  TRY_ON_ORCHESTRATOR,
  USERS_FILE_STORAGE,
} from '../../shared';
import { ITryOnService } from './service/i-try-on.service';
import { TryOnLambdaPayload } from './service/try-on-lambda-payload';
import { UploadTryOnAssetInput } from './service/upload-try-on-asset-input';

export const TRY_ON_SERVICE = 'TRY_ON_SERVICE';

export type { ITryOnService, UploadTryOnAssetInput, TryOnLambdaPayload };

function jobMetaKey(userId: string, jobId: string): string {
  return `try-on/${userId}/${jobId}/meta.json`;
}

function assetImageKey(userId: string, assetId: string, ext: string): string {
  return `try-on/assets/${userId}/${assetId}/image.${ext}`;
}

@Injectable()
export class TryOnService implements ITryOnService {
  private lambdaClient: LambdaClient = null;

  constructor(
    @Inject(TRY_ON_AI_SERVICE) private readonly tryOnAi: ITryOnAiService,
    @Inject(TRY_ON_ORCHESTRATOR) private readonly tryOnOrchestrator: ITryOnOrchestrator,
    @Inject(USERS_FILE_STORAGE) private readonly fileStorage: IUsersFileStorage,
    @Inject(TRY_ON_ASSETS_REPOSITORY) private readonly assetsRepo: ITryOnAssetsRepository,
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
    await this.fileStorage.writeAsync(key, Buffer.from(JSON.stringify(record), 'utf8'), 'application/json');
  }

  private async readJob(userId: string, jobId: string): Promise<TryOnJobRecord> {
    try {
      const buf = await this.fileStorage.readAsync(jobMetaKey(userId, jobId));
      return JSON.parse(buf.toString('utf8')) as TryOnJobRecord;
    } catch {
      return null;
    }
  }

  private async deleteJobMeta(userId: string, jobId: string): Promise<void> {
    try {
      await this.fileStorage.removeAsync(jobMetaKey(userId, jobId));
      this.logger.info({ userId, jobId }, 'Try-on job meta removed from storage');
    } catch (err) {
      this.logger.warn({ err, userId, jobId }, 'Failed to remove try-on job meta');
    }
  }

  private async toAssetResponse(record: TryOnAsset): Promise<TryOnAssetResponseModel> {
    const imageUrl = (await this.fileStorage.getUrlAsync(record.imageKey)) ?? record.imageKey;
    return {
      id: record.id,
      type: record.type,
      imageUrl,
      imageKey: record.imageKey,
      label: record.label,
      heightInInches: record.heightInInches,
      color: record.color,
      createdAt: record.createdAt.toISOString(),
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

    const heightInInches = input.heightInInches;
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
    const imageKey = await this.fileStorage.writeAsync(proposedKey, normalized.buffer, normalized.mimetype);

    const record = await this.assetsRepo.insert(
      plainToInstance(CreateTryOnAssetData, {
        id: assetId,
        userId,
        type,
        imageKey,
        label,
        heightInInches,
        color,
      }),
    );

    this.logger.info({ userId, assetId, type }, 'Try-on asset uploaded');
    return this.toAssetResponse(record);
  }

  async listAssets(userId: string, type?: string): Promise<TryOnAssetResponseModel[]> {
    const filter = type?.trim().toLowerCase() as TryOnAssetType;
    const items = await this.assetsRepo.findByUserId(userId, filter);
    return Promise.all(items.map((item) => this.toAssetResponse(item)));
  }

  async deleteAsset(userId: string, assetId: string): Promise<void> {
    const existing = await this.assetsRepo.findByIdForUser(userId, assetId);
    if (!existing) {
      throw new NotFoundException('Try-on asset not found');
    }

    try {
      await this.fileStorage.removeAsync(existing.imageKey);
    } catch (err) {
      this.logger.warn({ err, imageKey: existing.imageKey }, 'Failed to remove asset image');
    }

    await this.assetsRepo.deleteByIdForUser(userId, assetId);
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

    const jewelleryTypes = body.jewelleryItems.map((item) => item.type).filter(Boolean) as string[];
    const providerRoute = this.tryOnOrchestrator.resolveRoute(body.tryOnAttempt ?? 1, jewelleryTypes);

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
      providerRoute,
    };

    await this.dispatchJob(payload);
    this.logger.info(
      {
        jobId,
        userId,
        mode,
        provider: providerRoute.provider,
        attemptNumber: providerRoute.attemptNumber,
        cloudflareModel: providerRoute.cloudflareModel,
        inline: process.env.TRY_ON_INLINE === 'true',
        lambdaName: process.env.TRY_ON_LAMBDA_NAME?.trim() || null,
      },
      'Try-on job queued',
    );
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
    if (record?.userId !== userId) {
      throw new NotFoundException('Try-on job not found');
    }
    if (record.status === 'COMPLETED') {
      await this.deleteJobMeta(userId, jobId);
    } else if (record.status === 'FAILED') {
      await this.deleteJobMeta(userId, jobId);
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
        this.logger.info(
          { jobId: payload.jobId, provider: payload.providerRoute?.provider, mode: 'recolor' },
          'Try-on job processing started',
        );
        const req = payload.request as OutfitRecolorRequest;
        images.push(await this.tryOnAi.recolorOutfit(req));
      } else {
        const req = payload.request as JewelleryTryOnRequest;
        const mode = payload.mode === 'outfit' ? 'outfit' : 'jewellery';
        if (payload.providerRoute) {
          this.logger.info(
            {
              jobId: payload.jobId,
              mode,
              provider: payload.providerRoute.provider,
              attemptNumber: payload.providerRoute.attemptNumber,
              cloudflareModel: payload.providerRoute.cloudflareModel,
            },
            'Try-on job processing started',
          );
          const generated = await this.tryOnOrchestrator.generateTryOnImages(payload.providerRoute, req, mode);
          images.push(...generated);
        } else if (typeof this.tryOnAi.generateTryOnImages === 'function') {
          this.logger.info(
            { jobId: payload.jobId, mode, provider: process.env.TRY_ON_PROVIDER || 'default' },
            'Try-on job processing started (legacy provider)',
          );
          const generated = await this.tryOnAi.generateTryOnImages(req, mode);
          images.push(...generated);
        } else {
          this.logger.info({ jobId: payload.jobId, mode, provider: 'legacy-single' }, 'Try-on job processing started');
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
      this.logger.info(
        {
          jobId: payload.jobId,
          count: images.length,
          provider: payload.providerRoute?.provider,
          attemptNumber: payload.providerRoute?.attemptNumber,
        },
        'Try-on job completed',
      );
      return completed;
    } catch (err) {
      const failureReason = err instanceof Error ? err.message : String(err);
      const nextRoute = payload.providerRoute
        ? this.tryOnOrchestrator.resolveRoute(payload.providerRoute.attemptNumber + 1)
        : null;
      const failed: TryOnJobRecord = {
        ...base,
        status: 'FAILED',
        error: failureReason,
        updatedAt: new Date().toISOString(),
      };
      await this.writeJob(failed);
      this.logger.error(
        {
          err,
          jobId: payload.jobId,
          provider: payload.providerRoute?.provider,
          attemptNumber: payload.providerRoute?.attemptNumber,
          cloudflareModel: payload.providerRoute?.cloudflareModel,
          failureReason,
          nextUserAttempt: payload.providerRoute ? payload.providerRoute.attemptNumber + 1 : null,
          nextProvider: nextRoute?.provider,
          nextCloudflareModel: nextRoute?.cloudflareModel,
        },
        'Try-on job failed',
      );
      return failed;
    }
  }
}
