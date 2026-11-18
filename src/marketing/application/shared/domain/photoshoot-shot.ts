export interface PhotoshootShot {
  id: string;
  photoshootId: string;
  index: number;
  /** present | closeup | hands | worn */
  kind: string;
  prompt: string;
  imageKey: string | null;
  status: string;
  error?: string | null;
  updatedAt?: Date;
}
