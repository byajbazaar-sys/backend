export interface ScheduleMarketingPostInput {
  sourceType: 'campaign' | 'photoshoot';
  sourceId: string;
  sourceIndex?: number;
  mediaType: 'IMAGE' | 'REEL';
  caption: string;
  scheduledAt: string;
}
