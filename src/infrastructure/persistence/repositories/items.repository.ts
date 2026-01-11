import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ItemDocument, ItemsSchema } from '../schemas';
import { plainToInstance } from 'class-transformer';
import { IItemsRepository, Item } from '../../../application/features/items';

@Injectable()
export class ItemsRepository implements IItemsRepository {
  constructor(@InjectModel(ItemsSchema.name) private itemModel: Model<ItemDocument>) {}

  async create(createItem: Item): Promise<Item> {
    try {
      const createdItem = await this.itemModel.create(createItem);
      return plainToInstance(Item, createdItem.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async findById(id: string): Promise<Item> {
    try {
      const item = await this.itemModel.findById(new Types.ObjectId(id)).exec();
      if (!item) {
        throw new NotFoundException('Item not found');
      }
      return plainToInstance(Item, item.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      throw err;
    }
  }

  async findByName(name: string, createdBy: string): Promise<Item> {
    try {
      const item = await this.itemModel.findOne({ name, createdBy }).exec();
      if (!item) {
        throw new NotFoundException('Item not found');
      }
      return plainToInstance(Item, item.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      throw err;
    }
  }

  async findAll(): Promise<Item[]> {
    try {
      const items = await this.itemModel.find().exec();
      return plainToInstance(Item, items, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const result = await this.itemModel.findByIdAndDelete(new Types.ObjectId(id)).exec();
      if (!result) {
        throw new NotFoundException('Item not found');
      }
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      throw err;
    }
  }
}
