// ---------------------------------------------------------------- AI photoshoots

/** A photoshoot = one product photo → 4 jewellery-only photos (gift box, close-up, on display, flat lay). */
export enum EPhotoshootStatus {
  Generating = 'GENERATING',
  Ready = 'READY',
  Partial = 'PARTIAL',
  Failed = 'FAILED',
}
