import { MarketingActivity } from '../domain';

/**
 * Activity log (ByajBazaar logs service, separate logs database): campaign / photoshoot lifecycle, render jobs and
 * Kaggle account changes. Implementations never throw.
 */
export const MARKETING_ACTIVITY_LOG = 'MARKETING_ACTIVITY_LOG';

export interface IMarketingActivityLog {
  record(activity: MarketingActivity): Promise<void>;
}
