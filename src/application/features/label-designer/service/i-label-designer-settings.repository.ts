import { SaveLabelDesignerSettingsModel } from '../models';
import { LabelDesignerSettingsResponse } from './label-designer-settings-response';

export const LABEL_DESIGNER_SETTINGS_REPOSITORY = 'LABEL_DESIGNER_SETTINGS_REPOSITORY';

export interface ILabelDesignerSettingsRepository {
  findByUserId(userId: string): Promise<LabelDesignerSettingsResponse>;
  save(userId: string, settings: SaveLabelDesignerSettingsModel): Promise<LabelDesignerSettingsResponse>;
}
