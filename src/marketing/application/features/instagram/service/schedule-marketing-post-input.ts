import { InstagramPostOptions } from '../../../shared';

export interface ScheduleMarketingPostItemInput {
  sourceType: 'campaign' | 'photoshoot';
  sourceId: string;
  sourceIndex?: number;
  mediaType: 'IMAGE' | 'REEL';
}

export interface ScheduleMarketingPostInput extends ScheduleMarketingPostItemInput {
  /** 2–10 items: a carousel post. */
  items?: ScheduleMarketingPostItemInput[];
  options?: InstagramPostOptions;
  caption: string;
  scheduledAt: string;
}
