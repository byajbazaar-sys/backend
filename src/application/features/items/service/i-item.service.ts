import { Item } from '../domain';
import { CreateItemRequestModel } from '../models';

export const ITEM_SERVICE = 'IItemService';

export interface IItemService {
  create(data: CreateItemRequestModel, userId: string): Promise<Item>;
  getById(id: string): Promise<Item>;
  getAll(): Promise<Item[]>;
  delete(id: string): Promise<void>;
}
