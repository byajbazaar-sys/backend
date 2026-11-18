export interface CreatePhotoshootInput {
  inventoryItemId?: string;
  image?: { base64: string; mimeType: string };
  title?: string;
  /** For uploads (or to correct an item): what the piece is, e.g. "necklace", "earrings", "kada". */
  pieceType?: string;
  /** gold | silver | rose_gold | platinum | diamond (defaults to the item's metal). */
  metal?: string;
  setting?: string;
  model?: string;
  outfit?: string;
  aspect?: string;
  /** exact = keep the real product, new background (default); ai = full AI scene. */
  imageMode?: string;
}
