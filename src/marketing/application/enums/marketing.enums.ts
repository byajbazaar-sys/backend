/** Campaign = one input image → 5 scenes (image + 5 s video each) → merged film ending on the brand logo. */
export enum ECampaignStatus {
  /** Writing prompts and generating the 5 scene images (Kaggle). */
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
  /** Analyze source images with Qwen3-VL and generate campaign / photoshoot images with SDXL. */
  Images = 'IMAGES',
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
  /** Enabled in kaggle_credentials, setup not run yet. */
  New = 'NEW',
  SettingUp = 'SETTING_UP',
  Ready = 'READY',
  Failed = 'FAILED',
  /** Credentials removed or disabled in kaggle_credentials. */
  Disabled = 'DISABLED',
}

export const CAMPAIGN_SCENES = 5;

export const MARKETING_STYLES = ['studio', 'festive', 'luxury', 'minimal'] as const;
export type MarketingStyle = (typeof MARKETING_STYLES)[number];

/** fast = 480×832 render (quicker on free GPUs), hd = 704×1280. Both upscaled to 1080×1920. */
export const MARKETING_QUALITIES = ['fast', 'hd'] as const;
export type MarketingQuality = (typeof MARKETING_QUALITIES)[number];

// ---------------------------------------------------------------- AI photoshoots

/** A photoshoot = one product photo → a set of ad photos (on a model, close-up, hands, worn). */
export enum EPhotoshootStatus {
  Generating = 'GENERATING',
  Ready = 'READY',
  Partial = 'PARTIAL',
  Failed = 'FAILED',
}

/** Where the shoot happens. */
export const PHOTOSHOOT_SETTINGS = ['showroom', 'studio', 'wedding', 'festive'] as const;
export type PhotoshootSetting = (typeof PHOTOSHOOT_SETTINGS)[number];

/** The model's outfit (women) — men always wear a kurta / sherwani look. */
export const PHOTOSHOOT_OUTFITS = ['kurta', 'saree', 'lehenga', 'western'] as const;
export type PhotoshootOutfit = (typeof PHOTOSHOOT_OUTFITS)[number];

export const PHOTOSHOOT_MODELS = ['woman', 'man'] as const;
export type PhotoshootModel = (typeof PHOTOSHOOT_MODELS)[number];

/** Output shape → pixel size sent to the image model. */
export const PHOTOSHOOT_ASPECTS = {
  '3:4': { width: 768, height: 1024 },
  '1:1': { width: 1024, height: 1024 },
  '4:5': { width: 864, height: 1080 },
  '9:16': { width: 720, height: 1280 },
} as const;
export type PhotoshootAspect = keyof typeof PHOTOSHOOT_ASPECTS;

export const PHOTOSHOOT_METALS = ['gold', 'silver', 'rose_gold', 'platinum', 'diamond'] as const;
export type PhotoshootMetal = (typeof PHOTOSHOOT_METALS)[number];
