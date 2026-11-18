import { KaggleSettings } from '../domain';

export const MARKETING_SETTINGS_REPOSITORY = 'MARKETING_SETTINGS_REPOSITORY';

export interface IMarketingSettingsRepository {
  kaggle(): Promise<KaggleSettings>;
  saveKaggle(patch: Partial<KaggleSettings>): Promise<KaggleSettings>;
}
