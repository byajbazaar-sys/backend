// ---------------------------------------------------------------- AI photoshoots

/** A photoshoot = one product photo → a set of ad photos (on a model, close-up, hands, worn). */
export enum EPhotoshootStatus {
  Generating = 'GENERATING',
  Ready = 'READY',
  Partial = 'PARTIAL',
  Failed = 'FAILED',
}
