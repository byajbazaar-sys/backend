import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { ITryOnAssetsRepository, TryOnAsset, CreateTryOnAssetData, TryOnAssetType } from '../../../application';
import { TryOnAssetEntity } from '../entities/try-on-asset.entity';

@Injectable()
export class TryOnAssetsRepository implements ITryOnAssetsRepository {
  constructor(
    @InjectRepository(TryOnAssetEntity)
    private readonly repo: Repository<TryOnAssetEntity>,
  ) {}

  private mapEntity(entity: TryOnAssetEntity): TryOnAsset {
    return plainToInstance(
      TryOnAsset,
      {
        id: entity.id,
        userId: entity.createdBy,
        type: entity.type,
        imageKey: entity.imageKey,
        label: entity.label ?? undefined,
        heightInInches:
          entity.heightInInches != null ? Number(entity.heightInInches) : undefined,
        color: entity.color ?? undefined,
        createdAt: entity.createdAt,
      },
      { excludeExtraneousValues: true },
    );
  }

  async insert(data: CreateTryOnAssetData): Promise<TryOnAsset> {
    const entity = this.repo.create({
      id: data.id,
      createdBy: data.userId,
      type: data.type,
      imageKey: data.imageKey,
      label: data.label ?? null,
      heightInInches: data.heightInInches ?? null,
      color: data.color ?? null,
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    });
    const saved = await this.repo.save(entity);
    return this.mapEntity(saved);
  }

  async findByUserId(userId: string, type?: TryOnAssetType): Promise<TryOnAsset[]> {
    const entities = await this.repo.find({
      where: type ? { createdBy: userId, type } : { createdBy: userId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((entity) => this.mapEntity(entity));
  }

  async findByIdForUser(userId: string, id: string): Promise<TryOnAsset> {
    const entity = await this.repo.findOne({ where: { id, createdBy: userId } });
    return entity ? this.mapEntity(entity) : null;
  }

  async deleteByIdForUser(userId: string, id: string): Promise<boolean> {
    const result = await this.repo.delete({ id, createdBy: userId });
    return (result.affected ?? 0) > 0;
  }
}
