import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { ApiConfigurationEntity } from '../entities/api-configuration.entity';
import { ApiConfiguration, IApiConfigurationRepository } from '../../../application';

@Injectable()
export class ApiConfigurationRepository implements IApiConfigurationRepository {
  constructor(
    @InjectRepository(ApiConfigurationEntity)
    private readonly repo: Repository<ApiConfigurationEntity>,
  ) {}

  private map(entity: ApiConfigurationEntity): ApiConfiguration {
    return plainToInstance(ApiConfiguration, entity, { excludeExtraneousValues: true });
  }

  async findById(id: string): Promise<ApiConfiguration | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.map(entity) : null;
  }

  async findByUserId(userId: string): Promise<ApiConfiguration | null> {
    const entity = await this.repo.findOne({ where: { userId } });
    return entity ? this.map(entity) : null;
  }

  async findByApiKey(apiKey: string): Promise<ApiConfiguration | null> {
    const entity = await this.repo.findOne({ where: { apiKey } });
    return entity ? this.map(entity) : null;
  }

  async save(configuration: ApiConfiguration): Promise<ApiConfiguration> {
    const entity = this.repo.create(configuration as Partial<ApiConfigurationEntity>);
    const saved = await this.repo.save(entity);
    return this.map(saved);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }

  async updateStatus(userId: string, isActive: boolean): Promise<ApiConfiguration> {
    const existing = await this.repo.findOne({ where: { userId } });
    if (!existing) {
      throw new Error('API configuration not found');
    }
    existing.isActive = isActive;
    const saved = await this.repo.save(existing);
    return this.map(saved);
  }

  async touchLastUsed(id: string, at: Date = new Date()): Promise<void> {
    await this.repo.update(id, { lastUsedAt: at });
  }
}
