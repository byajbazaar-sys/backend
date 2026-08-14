import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { buildCatalogSlug } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  BulkUpdateCatalogVisibilityResponseModel,
  InventoryCatalogSummaryResponseModel,
  UpdateCatalogSettingsRequestModel,
} from '../models';
import { IInventoryCatalogService } from './i-inventory-catalog.service';
import { IInventoryItemsRepository, INVENTORY_ITEMS_REPOSITORY } from './i-inventory-items.repository';
import { IUsersRepository, USERS_REPOSITORY } from '../../users/service/i-users.repository';

@Injectable()
export class InventoryCatalogService implements IInventoryCatalogService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(INVENTORY_ITEMS_REPOSITORY) private readonly itemsRepo: IInventoryItemsRepository,
    @InjectPinoLogger(InventoryCatalogService.name) private readonly logger: PinoLogger,
  ) {}

  private buildCatalogUrl(catalogSlug?: string): string | undefined {
    if (!catalogSlug) return undefined;
    const baseDomain = (process.env.CATALOG_BASE_DOMAIN ?? 'byajbazaar.com').replace(/^\.+/, '');
    return `https://${catalogSlug}.${baseDomain}`;
  }

  private async buildSummary(userId: string): Promise<InventoryCatalogSummaryResponseModel> {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const publishedItemCount = await this.itemsRepo.countCatalogVisible(userId);
    const expectedSlug = user.businessName ? buildCatalogSlug(user.businessName) : '';
    const slugConflict =
      !!expectedSlug &&
      !user.catalogSlug &&
      (await this.usersRepo.existsCatalogSlug(expectedSlug, userId));

    const catalogEnabled = user.catalogEnabled !== false;
    const catalogActive = catalogEnabled && !!user.catalogSlug;

    return plainToInstance(
      InventoryCatalogSummaryResponseModel,
      {
        catalogSlug: user.catalogSlug,
        catalogEnabled,
        catalogActive,
        catalogUrl: this.buildCatalogUrl(user.catalogSlug),
        publishedItemCount,
        businessName: user.businessName,
        slugConflict,
      },
      { excludeExtraneousValues: true },
    );
  }

  async getSummary(userId: string): Promise<InventoryCatalogSummaryResponseModel> {
    return this.buildSummary(userId);
  }

  async updateSettings(
    userId: string,
    body: UpdateCatalogSettingsRequestModel,
  ): Promise<InventoryCatalogSummaryResponseModel> {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (body.catalogEnabled === true && !user.catalogSlug) {
      throw new BadRequestException(
        'Your catalog URL is not set up yet. Please choose a unique business name in your profile.',
      );
    }

    if (body.catalogEnabled !== undefined) {
      await this.usersRepo.update(userId, { catalogEnabled: body.catalogEnabled });
    }

    this.logger.info({ userId, catalogEnabled: body.catalogEnabled }, 'Catalog settings updated');
    return this.buildSummary(userId);
  }

  async bulkUpdateVisibility(
    userId: string,
    ids: string[],
    isCatalogVisible: boolean,
  ): Promise<BulkUpdateCatalogVisibilityResponseModel> {
    const uniqueIds = [...new Set(ids ?? [])];
    if (!uniqueIds.length) {
      throw new BadRequestException('No item ids provided');
    }

    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (isCatalogVisible && !user.catalogSlug) {
      throw new BadRequestException(
        'Your catalog URL is not set up yet. Please choose a unique business name before publishing items.',
      );
    }

    const updatedCount = await this.itemsRepo.bulkUpdateCatalogVisibility(
      uniqueIds,
      userId,
      isCatalogVisible,
    );

    this.logger.info({ userId, updatedCount, isCatalogVisible }, 'Catalog visibility bulk updated');
    return plainToInstance(BulkUpdateCatalogVisibilityResponseModel, { updatedCount }, {
      excludeExtraneousValues: true,
    });
  }
}
