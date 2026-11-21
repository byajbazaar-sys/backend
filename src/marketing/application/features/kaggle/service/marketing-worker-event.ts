/** Event a Kaggle notebook sends (WebSocket `marketingProgress`, or the HTTPS fallback). */
export interface MarketingWorkerEvent {
  jobId?: string;
  token?: string;
  stage?: string;
  progress?: number;
  message?: string;
  status?: 'completed' | 'failed';
  clipKey?: string;
  failedClips?: string[];
  /** clipDone: the seed of the delivered take (a string: 63-bit) and what its quality check still noticed. */
  seed?: string | null;
  qualityNotes?: string[];
  gpuInfo?: string;
  gpuCount?: number;
  qualityScore?: number;
  modelsDataset?: string;
  modelsCacheError?: string;
  modelsCached?: boolean;
  imageIndex?: number;
  imagePrompt?: string;
  motionPrompt?: string;
  /** imageDone: the re-staged scene (a model scene shown as a product shot — kids' pieces, or no take kept the design). */
  scenePrompt?: string;
  failedImages?: number[];
}
