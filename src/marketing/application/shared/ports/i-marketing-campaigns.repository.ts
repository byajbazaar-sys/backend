import { MarketingCampaign } from '../domain';
export const MARKETING_CAMPAIGNS_REPOSITORY = 'MARKETING_CAMPAIGNS_REPOSITORY';

export interface IMarketingCampaignsRepository {
  create(campaign: Omit<MarketingCampaign, 'id'>): Promise<MarketingCampaign>;
  findById(id: string): Promise<MarketingCampaign | null>;
  findForUser(id: string, userId: string): Promise<MarketingCampaign | null>;
  listForUser(userId: string, limit: number): Promise<MarketingCampaign[]>;
  update(id: string, patch: Partial<MarketingCampaign>): Promise<MarketingCampaign | null>;
  delete(id: string): Promise<void>;
  countActiveForUser(userId: string): Promise<number>;
}
