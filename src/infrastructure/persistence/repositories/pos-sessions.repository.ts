import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import { IPosSessionsRepository, PosSession, PosSessionPatch } from '../../../application';
import { EPosSessionStatus } from '../../../application/features/pos/enums/e-pos-session-status.enum';
import { PosSessionEntity } from '../entities/pos-session.entity';

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

  async findById(id: string): Promise<PosSession> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    return plainToInstance(PosSession, entity, { excludeExtraneousValues: true });
  }

  async findBySessionCode(sessionCode: string): Promise<PosSession> {
    const entity = await this.repo.findOne({ where: { sessionCode } });
    if (!entity) return null;
    return plainToInstance(PosSession, entity, { excludeExtraneousValues: true });
  }

  async update(id: string, data: PosSessionPatch): Promise<PosSession> {
    await this.repo.update(id, data as Partial<PosSessionEntity>);
    const updated = await this.repo.findOne({ where: { id } });
    return plainToInstance(PosSession, updated, { excludeExtraneousValues: true });
  }

  async updateStatus(id: string, status: EPosSessionStatus): Promise<PosSession> {
    return this.update(id, { status });
  }
}
