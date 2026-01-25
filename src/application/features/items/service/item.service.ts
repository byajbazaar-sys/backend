import { Inject, Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { Item } from '../domain';
import { IItemsRepository, ITEMS_REPOSITORY } from './i-items.repository';
import { IItemService } from './i-item.service';
import { CreateItemRequestModel } from '../models';
import { Types } from 'mongoose';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class ItemService implements IItemService {
  constructor(
    @Inject(ITEMS_REPOSITORY) private readonly itemsRepo: IItemsRepository,
    @InjectPinoLogger(ItemService.name) private readonly logger: PinoLogger,
  ) {}

  async create(data: CreateItemRequestModel, userId: string): Promise<Item> {
    try {
      this.logger.info({ itemName: data.name, userId }, 'Creating new item');
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

      const item = await this.itemsRepo.create(itemData);
      this.logger.info({ itemId: item.id, itemName: data.name }, 'Item created successfully');
      return item;
    } catch (err) {
      if (err instanceof ConflictException) {
        throw err;
      }
      this.logger.error({ err, itemName: data.name }, 'Error creating item');
      throw err;
    }
  }

  async getById(id: string): Promise<Item> {
    try {
      this.logger.info({ itemId: id }, 'Getting item by ID');
      const item = await this.itemsRepo.findById(id);
      if (!item) {
        throw new NotFoundException('Item not found');
      }
      return item;
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      this.logger.error({ err, itemId: id }, 'Error getting item by ID');
      throw err;
    }
  }

  async getAll(): Promise<Item[]> {
    try {
      this.logger.info('Getting all items');
      return await this.itemsRepo.findAll();
    } catch (err) {
      this.logger.error({ err }, 'Error getting all items');
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      this.logger.info({ itemId: id }, 'Deleting item');
      await this.itemsRepo.delete(id);
      this.logger.info({ itemId: id }, 'Item deleted successfully');
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      this.logger.error({ err, itemId: id }, 'Error deleting item');
      throw err;
    }
  }
}
