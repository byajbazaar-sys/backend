export interface PhotoshootShot {
  id: string;
  photoshootId: string;
  index: number;
  /** box | closeup | display | flatlay (present | hands | worn: photoshoots from before, made jewellery-only on regenerate) */
  kind: string;
  prompt: string;
  imageKey: string | null;
  status: string;
  error?: string | null;
  updatedAt?: Date;
}
