import { InventoryCategory } from '../domain';
import { UpdateInventoryCategoryRequestModel } from '../models';

export const INVENTORY_CATEGORIES_REPOSITORY = 'INVENTORY_CATEGORIES_REPOSITORY';

export interface IInventoryCategoriesRepository {
  create(data: InventoryCategory): Promise<InventoryCategory>;
  findById(id: string): Promise<InventoryCategory>;
  findByName(name: string, createdBy: string): Promise<InventoryCategory>;
  findAll(userId: string): Promise<InventoryCategory[]>;
  update(id: string, data: UpdateInventoryCategoryRequestModel): Promise<InventoryCategory>;
  delete(id: string): Promise<void>;
}
