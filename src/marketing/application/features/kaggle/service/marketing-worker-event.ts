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
  gpuInfo?: string;
  imageIndex?: number;
  imagePrompt?: string;
  motionPrompt?: string;
  failedImages?: number[];
}
