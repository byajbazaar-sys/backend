import { Injectable } from '@nestjs/common';
import { In, Repository } from 'typeorm';

import { MarketingPhotoshootEntity, MarketingPhotoshootShotEntity } from './entities';
import { MarketingDatabase } from './marketing-database';
import {
  Photoshoot,
  PhotoshootShot,
  EPhotoshootStatus,
  IMarketingPhotoshootShotsRepository,
  IMarketingPhotoshootsRepository,
} from '../../application';

@Injectable()
export class MarketingPhotoshootsRepository implements IMarketingPhotoshootsRepository {
  constructor(private readonly db: MarketingDatabase) {}

  private repo(): Promise<Repository<MarketingPhotoshootEntity>> {
    return this.db.repository(MarketingPhotoshootEntity);
  }

  async create(shoot: Omit<Photoshoot, 'id'>): Promise<Photoshoot> {
    const repo = await this.repo();
    return (await repo.save(
      repo.create(shoot as unknown as Partial<MarketingPhotoshootEntity>),
    )) as unknown as Photoshoot;
  }

  async findById(id: string): Promise<Photoshoot | null> {
    return (await (await this.repo()).findOne({ where: { id } })) as unknown as Photoshoot | null;
  }

  async findForUser(id: string, userId: string): Promise<Photoshoot | null> {
    return (await (await this.repo()).findOne({ where: { id, userId } })) as unknown as Photoshoot | null;
  }

  async listForUser(userId: string, limit: number): Promise<Photoshoot[]> {
    return (await (
      await this.repo()
    ).find({ where: { userId }, order: { createdAt: 'DESC' }, take: limit })) as unknown as Photoshoot[];
  }

  async update(id: string, patch: Partial<Photoshoot>): Promise<Photoshoot | null> {
    await (await this.repo()).update({ id }, patch as unknown as Partial<MarketingPhotoshootEntity>);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await (await this.repo()).delete({ id });
  }

  async countActiveForUser(userId: string): Promise<number> {
    return (await this.repo()).count({ where: { userId, status: EPhotoshootStatus.Generating } });
  }
}

@Injectable()
export class MarketingPhotoshootShotsRepository implements IMarketingPhotoshootShotsRepository {
  constructor(private readonly db: MarketingDatabase) {}

  private repo(): Promise<Repository<MarketingPhotoshootShotEntity>> {
    return this.db.repository(MarketingPhotoshootShotEntity);
  }

  async createMany(shots: Omit<PhotoshootShot, 'id'>[]): Promise<PhotoshootShot[]> {
    const repo = await this.repo();
    return (await repo.save(
      shots.map((s) => repo.create(s as Partial<MarketingPhotoshootShotEntity>)),
    )) as PhotoshootShot[];
  }

  async listFor(photoshootIds: string[]): Promise<PhotoshootShot[]> {
    if (!photoshootIds.length) return [];
    return (await (
      await this.repo()
    ).find({ where: { photoshootId: In(photoshootIds) }, order: { index: 'ASC' } })) as PhotoshootShot[];
  }

  async findByIndex(photoshootId: string, index: number): Promise<PhotoshootShot | null> {
    return (await (await this.repo()).findOne({ where: { photoshootId, index } })) as PhotoshootShot | null;
  }

  async update(id: string, patch: Partial<PhotoshootShot>): Promise<PhotoshootShot | null> {
    const repo = await this.repo();
    await repo.update({ id }, patch as Partial<MarketingPhotoshootShotEntity>);
    return (await repo.findOne({ where: { id } })) as PhotoshootShot | null;
  }
}
