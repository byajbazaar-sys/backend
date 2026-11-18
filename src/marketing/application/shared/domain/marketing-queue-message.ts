import { MarketingQueueStep } from './marketing-queue-step';

export interface MarketingQueueMessage {
  step: MarketingQueueStep;
  campaignId?: string;
  userId?: string;
  sceneIndex?: number;
  /** image step: also re-render the scene video afterwards. */
  render?: boolean;
  /** logo step: what to regenerate. */
  target?: 'image' | 'video' | 'both';
  /** watch step: the render job to check. */
  renderJobId?: string;
  /** photoshoot step: the shoot, and optionally the one photo to make again. */
  photoshootId?: string;
  shotIndex?: number;
}
