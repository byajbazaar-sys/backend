/** Campaign = one input image → 5 scenes (image + 5 s video each; every clip is a reel). */
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
