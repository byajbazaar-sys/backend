export enum ERenderJobKind {
  /** Render scene clips (and the logo clip when missing) and merge them. */
  Campaign = 'CAMPAIGN',
  /** Analyze source images with Qwen3-VL and generate campaign / photoshoot images with SDXL. */
  Images = 'IMAGES',
  /** Render only the brand logo clip. */
  Logo = 'LOGO',
  /** One-time check of a new Kaggle account (GPU T4 × 2, internet, installs) + its private model cache dataset. */
  Setup = 'SETUP',
  /**
   * A warm Kaggle session that keeps the models loaded and pulls IMAGES / CAMPAIGN / LOGO jobs one after another
   * (they run inside it and point at it through payload.sessionJobId). Occupies one slot of its account.
   */
  Worker = 'WORKER',
}
