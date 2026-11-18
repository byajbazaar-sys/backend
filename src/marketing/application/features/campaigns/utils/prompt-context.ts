import { MarketingStyle } from '../../../shared';

export interface PromptContext {
  title: string;
  style: MarketingStyle;
  businessName?: string | null;
  metalType?: string;
  purity?: string;
  categoryName?: string;
}
