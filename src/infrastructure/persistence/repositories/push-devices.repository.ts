import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { In, Repository } from 'typeorm';

import { IPushDevicesRepository, PushDevice } from '../../../application';
import { PushDeviceEntity } from '../entities';

@Injectable()
export class PushDevicesRepository implements IPushDevicesRepository {
  constructor(@InjectRepository(PushDeviceEntity) private readonly repo: Repository<PushDeviceEntity>) {}

  async upsert(userId: string, token: string, platform: string | null): Promise<PushDevice> {
    // A phone that changes hands (another owner logs in) moves to that owner.
    await this.repo.upsert({ userId, token, platform, lastSeenAt: new Date() }, ['token']);
    return plainToInstance(PushDevice, await this.repo.findOneOrFail({ where: { token } }), {
      excludeExtraneousValues: true,
    });
  }

  async remove(userId: string, token: string): Promise<void> {
    await this.repo.delete({ userId, token });
  }

  async listForUser(userId: string): Promise<PushDevice[]> {
    const rows = await this.repo.find({ where: { userId }, order: { lastSeenAt: 'DESC' }, take: 10 });
    return rows.map((row) => plainToInstance(PushDevice, row, { excludeExtraneousValues: true }));
  }

  async removeTokens(tokens: string[]): Promise<void> {
    if (tokens.length) await this.repo.delete({ token: In(tokens) });
  }
}
