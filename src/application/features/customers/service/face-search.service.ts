import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ESortOrder } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { Customer } from '../domain';
import {
  FaceLibraryStatusModel,
  FaceLibrarySyncResponseModel,
  FaceMatchResultModel,
  FaceSearchResponseModel,
} from '../models/face-search.models';
import { CUSTOMERS_REPOSITORY, ICustomersRepository } from './i-customers.repository';
import { IFaceSearchService } from './i-face-search.service';
import { CustomersDownloadFilterOptions } from '../options';
import { FaceCompareOptions, InsightFaceClient, QdrantClient } from '../../../../infrastructure/face-compare';
import { USERS_FILE_STORAGE, IUsersFileStorage } from '../../../shared';

function customerDisplayName(customer: Customer): string {
  return [customer.firstName, customer.middleName, customer.lastName].filter(Boolean).join(' ').trim() || 'Unknown';
}

function listFilter(userId: string): CustomersDownloadFilterOptions {
  return plainToInstance(CustomersDownloadFilterOptions, {
    createdBy: userId,
    name: '',
    sortOrder: ESortOrder.DESC,
    sortField: 'createdAt',
  });
}

@Injectable()
export class FaceSearchService implements IFaceSearchService {
  constructor(
    private readonly options: FaceCompareOptions,
    private readonly insightFace: InsightFaceClient,
    private readonly qdrant: QdrantClient,
    @Inject(CUSTOMERS_REPOSITORY) private readonly customersRepo: ICustomersRepository,
    @Inject(USERS_FILE_STORAGE) private readonly fileStorage: IUsersFileStorage,
    @InjectPinoLogger(FaceSearchService.name) private readonly logger: PinoLogger,
  ) {}

  private assertConfigured(): void {
    if (!this.options.isConfigured) {
      throw new BadRequestException(
        'Face search is not configured. Set FACE_COMPARE_API_URL, QDRANT_URL, and QDRANT_API_KEY.',
      );
    }
  }

  async getLibraryStatus(userId: string): Promise<FaceLibraryStatusModel> {
    this.assertConfigured();
    const customers = await this.customersRepo.listAllCustomers(listFilter(userId));
    const total = customers.filter((c) => c.profilePhotoRef).length;
    const searchable = await this.qdrant.countIndexed(userId);
    const checked = searchable;
    const progressPercent = total > 0 ? Math.min(100, Math.round((checked / total) * 100)) : 100;
    const ready = total === 0 || searchable >= total;

    return plainToInstance(
      FaceLibraryStatusModel,
      {
        ready,
        progressPercent,
        checked,
        total,
        searchable,
        statusText: ready ? 'Library ready' : 'Indexing customer photos…',
      },
      { excludeExtraneousValues: true },
    );
  }

  async syncLibrary(userId: string): Promise<FaceLibrarySyncResponseModel> {
    this.assertConfigured();
    const customers = await this.customersRepo.listAllCustomers(listFilter(userId));
    const withPhotos = customers.filter((c) => c.profilePhotoRef);

    let indexed = 0;
    let skipped = 0;
    let failed = 0;

    for (const customer of withPhotos) {
      try {
        await this.indexCustomerRecord(userId, customer);
        indexed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('No face detected')) {
          skipped += 1;
        } else {
          failed += 1;
          this.logger.warn({ customerId: customer.id, failureReason: message }, 'Face index skipped');
        }
      }
    }

    const status = await this.getLibraryStatus(userId);
    return plainToInstance(
      FaceLibrarySyncResponseModel,
      { ...status, indexed, skipped, failed },
      { excludeExtraneousValues: true },
    );
  }

  async searchByPhoto(userId: string, imageBuffer: Buffer): Promise<FaceSearchResponseModel> {
    this.assertConfigured();
    const vector = await this.insightFace.extractEmbedding(imageBuffer, 'compare');
    const hits = await this.qdrant.search(userId, vector, 5);

    const matches: FaceMatchResultModel[] = [];
    for (const hit of hits) {
      const customer = await this.customersRepo.findById(hit.payload.customerId, userId);
      if (!customer) continue;
      const profilePhotoUrl = customer.profilePhotoRef
        ? await this.fileStorage.getUrlAsync(customer.profilePhotoRef)
        : undefined;
      matches.push(
        plainToInstance(
          FaceMatchResultModel,
          {
            customerId: customer.id,
            customerName: customerDisplayName(customer),
            profilePhotoUrl,
            score: Math.round(hit.score * 1000) / 1000,
          },
          { excludeExtraneousValues: true },
        ),
      );
    }

    return plainToInstance(FaceSearchResponseModel, { matches }, { excludeExtraneousValues: true });
  }

  async indexCustomer(userId: string, customerId: string, imageBuffer?: Buffer): Promise<void> {
    if (!this.options.isConfigured) {
      this.logger.debug({ customerId, userId }, 'Face search not configured; skipping index');
      return;
    }
    const customer = await this.customersRepo.findById(customerId, userId);
    if (!customer?.profilePhotoRef) {
      await this.removeCustomer(userId, customerId);
      return;
    }
    await this.indexCustomerRecord(userId, customer, imageBuffer);
  }

  async removeCustomer(userId: string, customerId: string): Promise<void> {
    if (!this.options.isConfigured) return;
    try {
      await this.qdrant.deleteFace(customerId);
    } catch (err) {
      this.logger.warn({ customerId, userId, err }, 'Failed to remove face vector');
    }
  }

  private async indexCustomerRecord(userId: string, customer: Customer, imageBuffer?: Buffer): Promise<void> {
    if (!customer.profilePhotoRef) {
      throw new BadRequestException('Customer has no profile photo');
    }

    const buffer = imageBuffer ?? (await this.fileStorage.readAsync(customer.profilePhotoRef));
    const vector = await this.insightFace.extractEmbedding(buffer, 'index');
    await this.qdrant.upsertFace(customer.id, vector, {
      userId,
      customerId: customer.id,
      customerName: customerDisplayName(customer),
      profilePhotoRef: customer.profilePhotoRef,
    });
    this.logger.info({ customerId: customer.id, userId }, 'Customer face indexed in Qdrant');
  }
}
