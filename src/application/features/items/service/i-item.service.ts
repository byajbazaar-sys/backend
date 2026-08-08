import { Item } from '../domain';
import { CreateItemRequestModel, UpdateItemRequestModel } from '../models';

export const ITEM_SERVICE = 'IItemService';

export interface IItemService {
  create(data: CreateItemRequestModel, userId: string): Promise<Item>;
  getById(id: string): Promise<Item>;
  getAll(userId: string): Promise<Item[]>;
  update(id: string, data: UpdateItemRequestModel, userId: string): Promise<Item>;
  delete(id: string): Promise<void>;
}
