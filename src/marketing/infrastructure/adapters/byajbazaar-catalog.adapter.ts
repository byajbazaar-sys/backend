import { Inject, Injectable } from '@nestjs/common';
import axios from 'axios';

import {
  IInventoryItemsRepository,
  INVENTORY_ITEMS_REPOSITORY,
  IUsersRepository,
  USERS_REPOSITORY,
  IUsersFileStorage,
  USERS_FILE_STORAGE,
} from '../../../application';
import { MarketingCatalogItem, IMarketingCatalog } from '../../application';

/** Reads inventory items and their photos from ByajBazaar (main database + bucket). */
@Injectable()
export class ByajBazaarCatalogAdapter implements IMarketingCatalog {
  constructor(
    @Inject(INVENTORY_ITEMS_REPOSITORY) private readonly itemsRepo: IInventoryItemsRepository,
    @Inject(USERS_FILE_STORAGE) private readonly fileStorage: IUsersFileStorage,
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
  ) {}

  async businessName(userId: string): Promise<string | null> {
    return (await this.usersRepo.findById(userId))?.businessName ?? null;
  }

  async shopLogoRef(userId: string): Promise<string | null> {
    return (await this.usersRepo.findById(userId))?.shopLogoRef?.trim() || null;
  }

  async imageUrl(ref: string): Promise<string | null> {
    if (/^https?:\/\//.test(ref)) return ref;
    return (await this.fileStorage.getUrlAsync(ref)) ?? null;
  }

  async businessProfile(
    userId: string,
  ): Promise<{ name: string | null; address: string | null; state: string | null }> {
    const user = await this.usersRepo.findById(userId);
    const text = (value?: string | null) => value?.trim() || null;
    return { name: text(user?.businessName), address: text(user?.address), state: text(user?.state) };
  }

  async findItem(userId: string, itemId: string): Promise<MarketingCatalogItem | null> {
    const item = await this.itemsRepo.findById(itemId, userId);
    if (!item) return null;
    const grams = (v: unknown): number | undefined => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    return {
      id: item.id,
      itemName: item.itemName,
      metalType: item.metalType,
      purity: item.purity ?? undefined,
      categoryName: item.categoryName ?? undefined,
      netWeight: grams(item.netWeight),
      grossWeight: grams(item.grossWeight),
      hallmarked: !!item.huid?.trim(),
      imageKey: item.imageUrls?.find(Boolean),
    };
  }

  async readImage(imageKey: string): Promise<Buffer> {
    if (/^https?:\/\//.test(imageKey)) {
      const res = await axios.get<ArrayBuffer>(imageKey, { responseType: 'arraybuffer', timeout: 30_000 });
      return Buffer.from(res.data);
    }
    return this.fileStorage.readAsync(imageKey);
  }
}
