import { Inject, Injectable } from '@nestjs/common';

import { SaveLabelDesignerSettingsModel } from './models/save-label-designer-settings.model';
import {
  ILabelDesignerSettingsRepository,
  LABEL_DESIGNER_SETTINGS_REPOSITORY,
  LabelDesignerSettingsResponse,
} from './service';

@Injectable()
export class LabelDesignerSettingsService {
  constructor(
    @Inject(LABEL_DESIGNER_SETTINGS_REPOSITORY)
    private readonly settingsRepository: ILabelDesignerSettingsRepository,
  ) {}

  async get(userId: string): Promise<LabelDesignerSettingsResponse> {
    return this.settingsRepository.findByUserId(userId);
  }

  async save(
    userId: string,
    settings: SaveLabelDesignerSettingsModel,
  ): Promise<LabelDesignerSettingsResponse> {
    return this.settingsRepository.save(userId, settings);
  }
}
