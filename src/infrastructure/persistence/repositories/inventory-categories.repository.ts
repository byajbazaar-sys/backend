import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { SYSTEM_USER_ID } from '@shared-libs';
import { InventoryCategoryEntity } from '../entities/inventory-category.entity';
import { IInventoryCategoriesRepository, InventoryCategory, UpdateInventoryCategoryRequestModel } from '../../../application';

@Injectable()
export class InventoryCategoriesRepository implements IInventoryCategoriesRepository {
  constructor(
    @InjectRepository(InventoryCategoryEntity)
    private readonly repo: Repository<InventoryCategoryEntity>,
  ) {}

  async create(data: InventoryCategory): Promise<InventoryCategory> {
    const entity = this.repo.create(data);
    const created = await this.repo.save(entity);
    return plainToInstance(InventoryCategory, created, { excludeExtraneousValues: true });
  }

  async findById(id: string): Promise<InventoryCategory> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    return plainToInstance(InventoryCategory, entity, { excludeExtraneousValues: true });
  }

  async findByName(name: string, createdBy: string): Promise<InventoryCategory> {
    const entity = await this.repo.findOne({ where: { name, createdBy } });
    if (!entity) return null;
    return plainToInstance(InventoryCategory, entity, { excludeExtraneousValues: true });
  }

  async findAll(userId: string): Promise<InventoryCategory[]> {
    const entities = await this.repo.find({
      where: { createdBy: In([userId, SYSTEM_USER_ID]) },
      order: { name: 'ASC' },
    });
    return plainToInstance(InventoryCategory, entities, { excludeExtraneousValues: true });
  }

  async update(id: string, data: UpdateInventoryCategoryRequestModel): Promise<InventoryCategory> {
    await this.repo.update(id, data as Partial<InventoryCategoryEntity>);
    const updated = await this.repo.findOne({ where: { id } });
    return plainToInstance(InventoryCategory, updated, { excludeExtraneousValues: true });
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
