import { Inject, Injectable, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Item } from '../domain';
import { IItemsRepository, ITEMS_REPOSITORY } from './i-items.repository';
import { IItemService } from './i-item.service';
import { CreateItemRequestModel } from '../models';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { SYSTEM_USER_ID } from '@shared-libs';

@Injectable()
export class ItemService implements IItemService {
  constructor(
    @Inject(ITEMS_REPOSITORY) private readonly itemsRepo: IItemsRepository,
    @InjectPinoLogger(ItemService.name) private readonly logger: PinoLogger,
  ) { }

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

  async update(id: string, data: Partial<Item>, userId: string): Promise<Item> {
    try {
      this.logger.info({ itemId: id, userId }, 'Updating item');

      // Get the existing item to check if it's system-generated
      const existingItem = await this.itemsRepo.findById(id);
      if (!existingItem) {
        throw new NotFoundException('Item not found');
      }

      // Check if the item is system-generated (created by system)
      if (existingItem.createdBy === SYSTEM_USER_ID) {
        this.logger.warn({ itemId: id, createdBy: existingItem.createdBy }, 'Attempted to update system-generated item');
        throw new ForbiddenException('Cannot update system-generated items');
      }

      // Check if updating name would conflict with another item
      if (data.name && data.name !== existingItem.name) {
        try {
          await this.itemsRepo.findByName(data.name, userId);
          throw new ConflictException(`Item with name ${data.name} already exists`);
        } catch (err) {
          if (err instanceof ConflictException) {
            throw err;
          }
          // NotFoundException is expected, continue
        }
      }

      const updatedItem = await this.itemsRepo.update(id, data);
      this.logger.info({ itemId: id, itemName: updatedItem.name }, 'Item updated successfully');
      return updatedItem;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ConflictException || err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.error({ err, itemId: id }, 'Error updating item');
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      this.logger.info({ itemId: id }, 'Deleting item');
      const item = await this.itemsRepo.findById(id);
      if (!item) {
        throw new NotFoundException('Item not found');
      }
      if (item.createdBy === SYSTEM_USER_ID) {
        throw new ForbiddenException('Cannot delete system-generated items');
      }
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
