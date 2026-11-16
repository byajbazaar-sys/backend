import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CatalogDisplaySettings, resolveCatalogDisplay, sanitizeCatalogSlugParam } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { USERS_FILE_STORAGE, IUsersFileStorage } from '../../../shared';
import {
  IInventoryItemsRepository,
  INVENTORY_ITEMS_REPOSITORY,
} from '../../inventory/service/i-inventory-items.repository';
import { IUsersRepository, USERS_REPOSITORY } from '../../users/service/i-users.repository';
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

  /** Only the details the shop chose to show leave the server. */
  private async toPublicItem(item: InventoryItem, show: CatalogDisplaySettings): Promise<PublicCatalogItemModel> {
    const imageUrls = await this.resolveImageUrls(item.imageUrls ?? []);
    return plainToInstance(
      PublicCatalogItemModel,
      {
        id: item.id,
        itemName: item.itemName,
        imageUrls,
        description: show.description ? item.description : undefined,
        categoryName: show.category ? item.categoryName : undefined,
        metalType: show.metal ? item.metalType : undefined,
        purity: show.purity ? item.purity : undefined,
        grossWeight: show.grossWeight ? item.grossWeight : undefined,
        netWeight: show.netWeight ? item.netWeight : undefined,
        sellingPrice: show.price ? item.sellingPrice : undefined,
        hallmarked: show.hallmark ? item.hallmarked : undefined,
        size: show.size ? item.size : undefined,
        sku: show.sku ? item.sku : undefined,
        makingCharges: show.makingCharges ? item.makingCharges : undefined,
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
      shopLogoUrl = (await this.usersFileStorage.getUrlAsync(user.shopLogoRef)) ?? user.shopLogoRef ?? undefined;
    }

    const show = resolveCatalogDisplay(user.catalogDisplay);
    const showsWeight = show.netWeight || show.grossWeight;
    const priceSort = query.sort === 'price_asc' || query.sort === 'price_desc';
    const weightSort = query.sort === 'weight_asc' || query.sort === 'weight_desc';
    // Filters / sorts on hidden details are ignored, so they can't be used to probe hidden values.
    const paged = catalogActive
      ? await this.itemsRepo.findPublicCatalog(user.id, {
          search: query.search,
          categoryId: show.category ? query.categoryId : undefined,
          metalType: show.metal ? query.metalType : undefined,
          purity: show.purity ? query.purity : undefined,
          minWeight: showsWeight ? query.minWeight : undefined,
          maxWeight: showsWeight ? query.maxWeight : undefined,
          minPrice: show.price ? query.minPrice : undefined,
          maxPrice: show.price ? query.maxPrice : undefined,
          hallmarked: show.hallmark ? query.hallmarked : undefined,
          sort: (priceSort && !show.price) || (weightSort && !showsWeight) ? 'newest' : query.sort,
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

    const publicItems = await Promise.all(paged.items.map((item) => this.toPublicItem(item, show)));
    // Filter options only on the first page (the client keeps them while paging).
    const firstPage = (query.pageNumber ?? 1) <= 1;
    const facets = catalogActive && firstPage ? await this.itemsRepo.findPublicCatalogFacets(user.id) : undefined;

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
        display: show,
        whatsappNumber: user.catalogWhatsappNumber || user.phoneNumber || undefined,
        facets: facets
          ? {
              categories: show.category ? facets.categories : [],
              metals: show.metal ? facets.metals : [],
              purities: show.purity ? facets.purities : [],
              minWeight: showsWeight ? facets.minWeight : undefined,
              maxWeight: showsWeight ? facets.maxWeight : undefined,
              minPrice: show.price ? facets.minPrice : undefined,
              maxPrice: show.price ? facets.maxPrice : undefined,
            }
          : undefined,
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
