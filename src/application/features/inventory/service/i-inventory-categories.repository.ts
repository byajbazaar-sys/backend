import { InventoryCategory } from '../domain';

export const INVENTORY_CATEGORIES_REPOSITORY = 'INVENTORY_CATEGORIES_REPOSITORY';

export interface IInventoryCategoriesRepository {
  create(data: InventoryCategory): Promise<InventoryCategory>;
  findById(id: string): Promise<InventoryCategory | null>;
  findByName(name: string, createdBy: string): Promise<InventoryCategory | null>;
  findAll(userId: string): Promise<InventoryCategory[]>;
  update(id: string, data: Partial<InventoryCategory>): Promise<InventoryCategory>;
  delete(id: string): Promise<void>;
}
