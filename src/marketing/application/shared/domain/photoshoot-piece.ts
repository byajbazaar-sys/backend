export interface PhotoshootPiece {
  /** e.g. "bracelet", "necklace", "pair of earrings". */
  noun: string;
  metal: string;
  /** Where it is worn: neck | ears | finger | wrist | ankle | forehead | nose | hand. */
  wornOn: string;
  /** Extra words from the item (name, purity, stones) to anchor the design. */
  detail?: string;
}
