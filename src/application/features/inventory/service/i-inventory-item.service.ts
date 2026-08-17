import { Paged } from '@shared-libs';

import { BulkDeleteResult } from '../../../shared';

import { InventoryItem, InventoryItemSale } from '../domain';
import {
  CreateInventoryItemRequestModel,
  InventoryImageAiPreviewResponseModel,
  ListInventoryItemsQueryModel,
  UpdateInventoryItemRequestModel,
} from '../models';

export const INVENTORY_ITEM_SERVICE = 'INVENTORY_ITEM_SERVICE';

export interface IInventoryItemService {
  create(data: CreateInventoryItemRequestModel, userId: string): Promise<InventoryItem>;
  getAll(userId: string, query: ListInventoryItemsQueryModel): Promise<Paged<InventoryItem>>;
  getLiveCatalogItems(
    userId: string,
    query?: Pick<ListInventoryItemsQueryModel, 'pageNumber' | 'pageSize' | 'search'>,
  ): Promise<Paged<InventoryItem>>;
  getById(id: string, userId: string): Promise<InventoryItem>;
  getByBarcode(barcode: string, userId: string): Promise<InventoryItem>;
  getSalesHistory(id: string, userId: string): Promise<InventoryItemSale[]>;
  update(id: string, data: UpdateInventoryItemRequestModel, userId: string): Promise<InventoryItem>;
  delete(id: string, userId: string): Promise<void>;
  bulkDelete(ids: string[], userId: string): Promise<BulkDeleteResult>;
  generateSku(userId: string): Promise<string>;
  uploadImage(id: string, userId: string, file?: Express.Multer.File, removeImage?: boolean): Promise<InventoryItem>;
  previewAiImage(file: Express.Multer.File): Promise<InventoryImageAiPreviewResponseModel>;
  previewAiImageForItem(id: string, userId: string): Promise<InventoryImageAiPreviewResponseModel>;
}
