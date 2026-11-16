/** Campaign = one input image → 5 scenes (image + 5 s video each) → merged film ending on the brand logo. */
export enum ECampaignStatus {
  /** Writing prompts and generating the 5 scene images (Cloudflare). */
  Planning = 'PLANNING',
  /** Waiting for a free Kaggle GPU account. */
  WaitingGpu = 'WAITING_GPU',
  /** Kaggle is rendering / merging. */
  Rendering = 'RENDERING',
  Completed = 'COMPLETED',
  /** Some scenes failed; the rest (and the merge) are available. */
  Partial = 'PARTIAL',
  Failed = 'FAILED',
}

export enum EAssetStatus {
  Pending = 'PENDING',
  Generating = 'GENERATING',
  Ready = 'READY',
  Failed = 'FAILED',
}

export enum ERenderJobKind {
  /** Render scene clips (and the logo clip when missing) and merge them. */
  Campaign = 'CAMPAIGN',
  /** Render only the brand logo clip. */
  Logo = 'LOGO',
  /** One-time check of a new Kaggle account (GPU T4 × 2, internet, installs). */
  Setup = 'SETUP',
}

export enum ERenderJobStatus {
  Waiting = 'WAITING',
  Starting = 'STARTING',
  Running = 'RUNNING',
  Done = 'DONE',
  Failed = 'FAILED',
}

export const BUSY_RENDER_STATUSES = [ERenderJobStatus.Starting, ERenderJobStatus.Running];

export enum EKaggleAccountStatus {
  /** Listed in KAGGLE_WORKERS, setup not run yet. */
  New = 'NEW',
  SettingUp = 'SETTING_UP',
  Ready = 'READY',
  Failed = 'FAILED',
  /** Removed from KAGGLE_WORKERS. */
  Disabled = 'DISABLED',
}

export const CAMPAIGN_SCENES = 5;

export const MARKETING_STYLES = ['studio', 'festive', 'luxury', 'minimal'] as const;
export type MarketingStyle = (typeof MARKETING_STYLES)[number];

/** fast = 480×832 render (quicker on free GPUs), hd = 704×1280. Both upscaled to 1080×1920. */
export const MARKETING_QUALITIES = ['fast', 'hd'] as const;
export type MarketingQuality = (typeof MARKETING_QUALITIES)[number];
