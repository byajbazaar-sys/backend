import { MarketingScheduledPost } from '../domain';
export const MARKETING_SCHEDULED_POSTS_REPOSITORY = 'MARKETING_SCHEDULED_POSTS_REPOSITORY';

export interface IMarketingScheduledPostsRepository {
  create(post: Omit<MarketingScheduledPost, 'id'>): Promise<MarketingScheduledPost>;
  findForUser(id: string, userId: string): Promise<MarketingScheduledPost | null>;
  listForUser(userId: string, limit: number): Promise<MarketingScheduledPost[]>;
  update(id: string, patch: Partial<MarketingScheduledPost>): Promise<MarketingScheduledPost | null>;
  cancelForUser(id: string, userId: string): Promise<boolean>;
  hasOpenForSource(
    userId: string,
    sourceType: 'campaign' | 'photoshoot',
    sourceId: string,
    sourceIndex?: number,
  ): Promise<boolean>;
  claimDue(now: Date, limit: number): Promise<MarketingScheduledPost[]>;
}
