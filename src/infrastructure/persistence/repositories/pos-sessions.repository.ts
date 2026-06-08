import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { PosSessionEntity } from '../entities/pos-session.entity';
import { IPosSessionsRepository, PosSession } from '../../../application';
import { EPosSessionStatus } from '../../../application/features/inventory/enums';

@Injectable()
export class PosSessionsRepository implements IPosSessionsRepository {
  constructor(
    @InjectRepository(PosSessionEntity)
    private readonly repo: Repository<PosSessionEntity>,
  ) {}

  async create(data: PosSession): Promise<PosSession> {
    const entity = this.repo.create(data);
    const created = await this.repo.save(entity);
    return plainToInstance(PosSession, created, { excludeExtraneousValues: true });
  }

  async findById(id: string): Promise<PosSession | null> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    return plainToInstance(PosSession, entity, { excludeExtraneousValues: true });
  }

  async findBySessionCode(sessionCode: string): Promise<PosSession | null> {
    const entity = await this.repo.findOne({ where: { sessionCode } });
    if (!entity) return null;
    return plainToInstance(PosSession, entity, { excludeExtraneousValues: true });
  }

  async update(id: string, data: Partial<PosSession>): Promise<PosSession> {
    await this.repo.update(id, data as Partial<PosSessionEntity>);
    const updated = await this.repo.findOne({ where: { id } });
    return plainToInstance(PosSession, updated, { excludeExtraneousValues: true });
  }

  async updateStatus(id: string, status: EPosSessionStatus): Promise<PosSession> {
    return this.update(id, { status });
  }
}
