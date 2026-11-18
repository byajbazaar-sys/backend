import { MarketingScene } from '../domain';
export const MARKETING_SCENES_REPOSITORY = 'MARKETING_SCENES_REPOSITORY';

export interface IMarketingScenesRepository {
  createMany(scenes: Omit<MarketingScene, 'id'>[]): Promise<MarketingScene[]>;
  listForCampaign(campaignId: string): Promise<MarketingScene[]>;
  findByIndex(campaignId: string, index: number): Promise<MarketingScene | null>;
  update(id: string, patch: Partial<MarketingScene>): Promise<MarketingScene | null>;
  deleteForCampaign(campaignId: string): Promise<void>;
}
