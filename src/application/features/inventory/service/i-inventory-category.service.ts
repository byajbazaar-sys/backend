import { InventoryCategory } from '../domain';
import { CreateInventoryCategoryRequestModel } from '../models';

export const INVENTORY_CATEGORY_SERVICE = 'INVENTORY_CATEGORY_SERVICE';

export interface IInventoryCategoryService {
  create(data: CreateInventoryCategoryRequestModel, userId: string): Promise<InventoryCategory>;
  getAll(userId: string): Promise<InventoryCategory[]>;
  getById(id: string, userId: string): Promise<InventoryCategory>;
  update(id: string, data: Partial<CreateInventoryCategoryRequestModel>, userId: string): Promise<InventoryCategory>;
  delete(id: string, userId: string): Promise<void>;
}
