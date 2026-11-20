export interface NotebookClip {
  key: string;
  imageUrl: string;
  /** Product mask of the scene still (from the image notebook): those pixels are locked into every frame. */
  maskUrl?: string;
  prompt: string;
  negative: string;
  seed: number;
  uploadUrl: string;
}
