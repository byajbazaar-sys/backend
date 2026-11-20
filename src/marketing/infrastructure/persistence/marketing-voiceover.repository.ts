import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';

import { MarketingVoiceoverEntity } from './entities';
import { MarketingDatabase } from './marketing-database';
import { EVoiceoverStatus, IMarketingVoiceoversRepository, Voiceover } from '../../application';

@Injectable()
export class MarketingVoiceoversRepository implements IMarketingVoiceoversRepository {
  constructor(private readonly db: MarketingDatabase) {}

  private repo(): Promise<Repository<MarketingVoiceoverEntity>> {
    return this.db.repository(MarketingVoiceoverEntity);
  }

  async create(voiceover: Omit<Voiceover, 'id'>): Promise<Voiceover> {
    const repo = await this.repo();
    return (await repo.save(
      repo.create(voiceover as unknown as Partial<MarketingVoiceoverEntity>),
    )) as unknown as Voiceover;
  }

  async findById(id: string): Promise<Voiceover | null> {
    return (await (await this.repo()).findOne({ where: { id } })) as unknown as Voiceover | null;
  }

  async findForUser(id: string, userId: string): Promise<Voiceover | null> {
    return (await (await this.repo()).findOne({ where: { id, userId } })) as unknown as Voiceover | null;
  }

  async listForUser(userId: string, limit: number): Promise<Voiceover[]> {
    return (await (
      await this.repo()
    ).find({ where: { userId }, order: { createdAt: 'DESC' }, take: limit })) as unknown as Voiceover[];
  }

  async update(id: string, patch: Partial<Voiceover>): Promise<Voiceover | null> {
    await (await this.repo()).update({ id }, patch as unknown as Partial<MarketingVoiceoverEntity>);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await (await this.repo()).delete({ id });
  }

  async countActiveForUser(userId: string): Promise<number> {
    return (await this.repo()).count({ where: { userId, status: EVoiceoverStatus.Generating } });
  }
}
