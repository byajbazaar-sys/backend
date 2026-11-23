import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import { IInboxSettingsRepository, InboxSettings } from '../../../application';
import { InboxSettingsEntity } from '../entities';

@Injectable()
export class InboxSettingsRepository implements IInboxSettingsRepository {
  constructor(@InjectRepository(InboxSettingsEntity) private readonly repo: Repository<InboxSettingsEntity>) {}

  async find(userId: string): Promise<InboxSettings | null> {
    const row = await this.repo.findOne({ where: { userId } });
    return row ? this.toDomain(row) : null;
  }

  async save(settings: InboxSettings): Promise<InboxSettings> {
    const row = await this.repo.save(this.repo.create({ ...settings, faqs: settings.faqs ?? [] }));
    return this.toDomain(row);
  }

  private toDomain(row: InboxSettingsEntity): InboxSettings {
    return plainToInstance(
      InboxSettings,
      { ...row, faqs: Array.isArray(row.faqs) ? row.faqs : [] },
      {
        excludeExtraneousValues: true,
      },
    );
  }
}
