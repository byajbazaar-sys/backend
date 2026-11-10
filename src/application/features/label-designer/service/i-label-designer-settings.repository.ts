import { SaveLabelDesignerSettingsModel } from '../models/save-label-designer-settings.model';

export const LABEL_DESIGNER_SETTINGS_REPOSITORY = 'LABEL_DESIGNER_SETTINGS_REPOSITORY';

export interface LabelDesignerSettingsResponse {
  schemaVersion: number;
  templates: Record<string, unknown>[];
  printerProfiles: Record<string, unknown>[];
}

export interface ILabelDesignerSettingsRepository {
  findByUserId(userId: string): Promise<LabelDesignerSettingsResponse>;
  save(userId: string, settings: SaveLabelDesignerSettingsModel): Promise<LabelDesignerSettingsResponse>;
}
