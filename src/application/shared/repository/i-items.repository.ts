import { Item } from '../../features';
import { UpdateItemRequestModel } from '../../features/items/models';

export const ITEMS_REPOSITORY = 'ITEMS_REPOSITORY';

export interface IItemsRepository {
  create(createItem: Item): Promise<Item>;
  findById(id: string): Promise<Item>;
  findByName(name: string, createdBy: string): Promise<Item>;
  findAll(userId: string): Promise<Item[]>;
  update(id: string, updateItem: UpdateItemRequestModel): Promise<Item>;
  delete(id: string): Promise<void>;
}
