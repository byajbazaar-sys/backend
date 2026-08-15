import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { plainToInstance } from 'class-transformer';
import { sanitizeCatalogSlugParam } from '@shared-libs';

import { IUsersRepository, USERS_REPOSITORY } from '../../users/service/i-users.repository';
import { IInventoryItemsRepository, INVENTORY_ITEMS_REPOSITORY } from '../../inventory/service/i-inventory-items.repository';
import { USERS_FILE_STORAGE, IUsersFileStorage } from '../../../shared';
import { ListPublicCatalogQueryModel, PublicCatalogItemModel, PublicCatalogResponseModel } from '../models';
import { IPublicCatalogService } from './i-public-catalog.service';
import { InventoryItem } from '../../inventory/domain';

@Injectable()
export class PublicCatalogService implements IPublicCatalogService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(INVENTORY_ITEMS_REPOSITORY) private readonly itemsRepo: IInventoryItemsRepository,
    @Inject(USERS_FILE_STORAGE) private readonly usersFileStorage: IUsersFileStorage,
    @InjectPinoLogger(PublicCatalogService.name) private readonly logger: PinoLogger,
  ) {}

  private isStorageKey(value: string): boolean {
    return !!value && !value.startsWith('http');
  }

  private async resolveImageUrls(keys: string[]): Promise<string[]> {
    if (!keys?.length) return [];
    return Promise.all(
      keys.map(async (key) => {
        if (!key || !this.isStorageKey(key)) return key;
        const url = await this.usersFileStorage.getUrlAsync(key);
        return url ?? key;
      }),
    );
  }

  private async toPublicItem(item: InventoryItem): Promise<PublicCatalogItemModel> {
    const imageUrls = await this.resolveImageUrls(item.imageUrls ?? []);
    return plainToInstance(
      PublicCatalogItemModel,
      {
        itemName: item.itemName,
        description: item.description,
        categoryName: item.categoryName,
        metalType: item.metalType,
        purity: item.purity,
        grossWeight: item.grossWeight,
        netWeight: item.netWeight,
        sellingPrice: item.sellingPrice,
        imageUrls,
        hallmarked: item.hallmarked,
      },
      { excludeExtraneousValues: true },
    );
  }

  async getCatalogBySlug(slug: string, query: ListPublicCatalogQueryModel): Promise<PublicCatalogResponseModel> {
    const catalogSlug = sanitizeCatalogSlugParam(slug);
    if (!catalogSlug) {
      throw new NotFoundException('Catalog not found');
    }

    const user = await this.usersRepo.findByCatalogSlug(catalogSlug);
    if (!user?.id) {
      throw new NotFoundException('Catalog not found');
    }

    const catalogEnabled = user.catalogEnabled !== false;
    const catalogActive = catalogEnabled && !!user.catalogSlug;

    let shopLogoUrl: string | undefined;
    if (user.shopLogoRef) {
      shopLogoUrl =
        (await this.usersFileStorage.getUrlAsync(user.shopLogoRef)) ?? user.shopLogoRef ?? undefined;
    }

    const paged =
      catalogActive
        ? await this.itemsRepo.findPublicCatalog(user.id, {
            search: query.search,
            categoryId: query.categoryId,
            metalType: query.metalType,
            pageNumber: query.pageNumber,
            pageSize: query.pageSize,
          })
        : {
            items: [] as InventoryItem[],
            page: query.pageNumber ?? 0,
            perPage: query.pageSize ?? 24,
            totalCount: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          };

    const publicItems = await Promise.all(paged.items.map((item) => this.toPublicItem(item)));

    this.logger.debug(
      { catalogSlug, itemCount: publicItems.length, totalCount: paged.totalCount },
      'Public catalog fetched',
    );

    return plainToInstance(
      PublicCatalogResponseModel,
      {
        businessName: user.businessName ?? '',
        catalogSlug: user.catalogSlug,
        shopLogoUrl,
        address: user.address,
        phoneNumber: user.phoneNumber,
        catalogEnabled,
        catalogActive,
        tryOnBackgroundColor: user.tryOnBackgroundColor,
        catalog: {
          items: publicItems,
          pageNumber: paged.page,
          pageSize: paged.perPage,
          totalCount: paged.totalCount,
          totalPages: paged.totalPages,
        },
      },
      { excludeExtraneousValues: true },
    );
  }
}
