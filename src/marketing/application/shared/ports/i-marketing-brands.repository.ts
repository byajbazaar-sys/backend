import { MarketingBrand } from '../domain';
export const MARKETING_BRANDS_REPOSITORY = 'MARKETING_BRANDS_REPOSITORY';

export interface IMarketingBrandsRepository {
  find(userId: string): Promise<MarketingBrand | null>;
  upsert(brand: Partial<MarketingBrand> & { userId: string }): Promise<MarketingBrand>;
}
