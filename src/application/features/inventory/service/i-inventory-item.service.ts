import { Paged } from '@shared-libs';
import { InventoryItem } from '../domain';
import { CreateInventoryItemRequestModel, ListInventoryItemsQueryModel } from '../models';

export const INVENTORY_ITEM_SERVICE = 'INVENTORY_ITEM_SERVICE';

export interface IInventoryItemService {
  create(data: CreateInventoryItemRequestModel, userId: string): Promise<InventoryItem>;
  getAll(userId: string, query: ListInventoryItemsQueryModel): Promise<Paged<InventoryItem>>;
  getById(id: string, userId: string): Promise<InventoryItem>;
  getByBarcode(barcode: string, userId: string): Promise<InventoryItem>;
  update(id: string, data: Partial<CreateInventoryItemRequestModel>, userId: string): Promise<InventoryItem>;
  delete(id: string, userId: string): Promise<void>;
  generateSku(): Promise<string>;
  uploadImage(
    id: string,
    userId: string,
    file?: Express.Multer.File,
    removeImage?: boolean,
  ): Promise<InventoryItem>;
}
