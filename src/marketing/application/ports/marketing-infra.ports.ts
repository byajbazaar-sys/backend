import { EAttachmentMimeType } from '@shared-libs';

/** Marketing's own S3 bucket. */
export const MARKETING_FILE_STORAGE = 'MARKETING_FILE_STORAGE';
export interface IMarketingFileStorage {
  existsAsync(path: string): Promise<boolean>;
  readAsync(path: string): Promise<Buffer>;
  writeAsync(path: string, data: Buffer, contentType?: string): Promise<string>;
  removeAsync(path: string): Promise<boolean>;
  getUrlAsync(path: string): Promise<string>;
  generateUploadUrlAsync(path: string, mimeType: EAttachmentMimeType): Promise<string>;
}

/**
 * Queue steps:
 *  - plan:     prompts (text model) + scene images (image model) for a campaign, then queue the render
 *  - image:    regenerate one scene image (optionally re-render its video)
 *  - logo:     generate the brand logo image (and queue the logo video render)
 *  - dispatch: sync Kaggle accounts (setting up new ones) and hand waiting render jobs to free accounts
 *  - watch:    watchdog for a running render job: restarts it in a new session when the Kaggle session expired,
 *              crashed or hung
 */
export type MarketingQueueStep = 'plan' | 'image' | 'logo' | 'dispatch' | 'watch';

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
}

/** Marketing job queue (Upstash QStash). Keeps Kaggle from being flooded: dispatches run one at a time. */
export const MARKETING_QUEUE = 'MARKETING_QUEUE';
export interface IMarketingQueue {
  readonly enabled: boolean;
  enqueue(message: MarketingQueueMessage, options?: { delaySeconds?: number; deduplicationId?: string }): Promise<void>;
  /** Verifies the Upstash-Signature header of an incoming delivery. */
  verify(signature: string | undefined, rawBody: string): Promise<boolean>;
}
