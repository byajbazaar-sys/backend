export enum ERenderJobKind {
  /** Render scene clips (and the logo clip when missing). */
  Campaign = 'CAMPAIGN',
  /** Analyse the product photo with Qwen3-VL and paint campaign / photoshoot / logo images with FLUX.2 [klein]. */
  Images = 'IMAGES',
  /** Render only the brand logo clip. */
  Logo = 'LOGO',
  /** Speak a voiceover's text in the voice of its sample (ChatterBox Multilingual, the voice notebook). */
  Voice = 'VOICE',
  /** One-time check of a new Kaggle account (GPU T4 × 2, internet, installs) + its private model cache dataset. */
  Setup = 'SETUP',
  /**
   * A warm Kaggle session that keeps the models loaded and pulls IMAGES / CAMPAIGN / LOGO / VOICE jobs one after another
   * (they run inside it and point at it through payload.sessionJobId). Occupies one slot of its account.
   */
  Worker = 'WORKER',
}
