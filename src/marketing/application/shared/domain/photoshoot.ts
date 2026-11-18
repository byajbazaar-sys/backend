import { PhotoshootPiece } from './photoshoot-piece';

/** One product photo → a set of AI ad photos. */
export interface Photoshoot {
  id: string;
  userId: string;
  title: string;
  inventoryItemId: string | null;
  sourceImageKey: string;
  /** What the piece is, used to describe it to the image model (keeps metal / design faithful). */
  piece: PhotoshootPiece;
  setting: string;
  model: string;
  outfit: string;
  aspect: string;
  status: string;
  error?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
