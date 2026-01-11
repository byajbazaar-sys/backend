import { Inject, Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { Item } from '../domain';
import { IItemsRepository, ITEMS_REPOSITORY } from './i-items.repository';
import { IItemService } from './i-item.service';
import { CreateItemRequestModel } from '../models';
import { Types } from 'mongoose';

@Injectable()
export class ItemService implements IItemService {
  constructor(@Inject(ITEMS_REPOSITORY) private readonly itemsRepo: IItemsRepository) {}

  async create(data: CreateItemRequestModel, userId: string): Promise<Item> {
    try {
      // Check if item with this type already exists
      try {
        await this.itemsRepo.findByName(data.name, userId);
        throw new ConflictException(`Item with name ${data.name} already exists`);
      } catch (err) {
        if (err instanceof ConflictException) {
          throw err;
        }
        // NotFoundException is expected, continue
      }

      const itemData: Item = {
        ...data,
        _id: new Types.ObjectId(),
        createdBy: userId,
      };

      return await this.itemsRepo.create(itemData);
    } catch (err) {
      if (err instanceof ConflictException) {
        throw err;
      }
      throw err;
    }
  }

  async getById(id: string): Promise<Item> {
    try {
      return await this.itemsRepo.findById(id);
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      throw err;
    }
  }

  async getAll(): Promise<Item[]> {
    try {
      return await this.itemsRepo.findAll();
    } catch (err) {
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.itemsRepo.delete(id);
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      throw err;
    }
  }
}
