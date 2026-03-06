import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemEntity } from '../entities/item.entity';
import { plainToInstance } from 'class-transformer';
import { IItemsRepository, Item } from '../../../application/features/items';

@Injectable()
export class ItemsRepository implements IItemsRepository {
  constructor(@InjectRepository(ItemEntity) private itemRepo: Repository<ItemEntity>) {}

  async create(createItem: Item): Promise<Item> {
    const entity = this.itemRepo.create(createItem);
    const created = await this.itemRepo.save(entity);
    return plainToInstance(Item, created, { excludeExtraneousValues: true });
  }

  async findById(id: string): Promise<Item> {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    return plainToInstance(Item, item, { excludeExtraneousValues: true });
  }

  async findByName(name: string, createdBy: string): Promise<Item> {
    const item = await this.itemRepo.findOne({ where: { name, createdById: createdBy } });
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    return plainToInstance(Item, item, { excludeExtraneousValues: true });
  }

  async findAll(): Promise<Item[]> {
    const items = await this.itemRepo.find();
    return plainToInstance(Item, items, { excludeExtraneousValues: true });
  }

  async update(id: string, updateItem: Partial<Item>): Promise<Item> {
    await this.itemRepo.update(id, updateItem as Partial<ItemEntity>);
    const updated = await this.itemRepo.findOne({ where: { id } });
    if (!updated) {
      throw new NotFoundException('Item not found');
    }
    return plainToInstance(Item, updated, { excludeExtraneousValues: true });
  }

  async delete(id: string): Promise<void> {
    const result = await this.itemRepo.delete(id);
    if (!result.affected) {
      throw new NotFoundException('Item not found');
    }
  }
}
