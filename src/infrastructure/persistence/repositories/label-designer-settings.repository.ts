import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ILabelDesignerSettingsRepository,
  LabelDesignerSettingsResponse,
  SaveLabelDesignerSettingsModel,
} from '../../../application';
import { LabelDesignerSettingsEntity } from '../entities';

@Injectable()
export class LabelDesignerSettingsRepository implements ILabelDesignerSettingsRepository {
  constructor(
    @InjectRepository(LabelDesignerSettingsEntity)
    private readonly repo: Repository<LabelDesignerSettingsEntity>,
  ) {}

  private map(entity: LabelDesignerSettingsEntity | null): LabelDesignerSettingsResponse {
    if (!entity) {
      return {
        schemaVersion: 1,
        templates: [],
        printerProfiles: [],
      };
    }

    return {
      schemaVersion: entity.schemaVersion ?? 1,
      templates: entity.templates ?? [],
      printerProfiles: entity.printerProfiles ?? [],
    };
  }

  async findByUserId(userId: string): Promise<LabelDesignerSettingsResponse> {
    const entity = await this.repo.findOne({ where: { userId } });
    return this.map(entity);
  }

  async save(userId: string, settings: SaveLabelDesignerSettingsModel): Promise<LabelDesignerSettingsResponse> {
    await this.repo.upsert(
      {
        userId,
        schemaVersion: settings.schemaVersion,
        templates: settings.templates,
        printerProfiles: settings.printerProfiles,
      },
      ['userId'],
    );

    return this.findByUserId(userId);
  }
}
