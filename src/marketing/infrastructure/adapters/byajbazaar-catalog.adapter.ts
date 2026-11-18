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

  async findItem(userId: string, itemId: string): Promise<MarketingCatalogItem | null> {
    const item = await this.itemsRepo.findById(itemId, userId);
    if (!item) return null;
    return { id: item.id, itemName: item.itemName, imageKey: item.imageUrls?.find(Boolean) };
  }

  async readImage(imageKey: string): Promise<Buffer> {
    if (/^https?:\/\//.test(imageKey)) {
      const res = await axios.get<ArrayBuffer>(imageKey, { responseType: 'arraybuffer', timeout: 30_000 });
      return Buffer.from(res.data);
    }
    return this.fileStorage.readAsync(imageKey);
  }
}
