import { RenderClipSpec } from './render-clip-spec';
import { WorkerSessionPayload } from './worker-session-payload';

export interface RenderJobPayload {
  clips: RenderClipSpec[];
  imageGeneration?: {
    type: 'campaign' | 'photoshoot' | 'logo';
    /** exact = cut-out product + new background; ai = full AI scene (logos ignore it). */
    mode?: 'exact' | 'ai';
    sourceImageKey?: string;
    title: string;
    style?: string;
    renderAfter?: boolean;
    photoshootId?: string;
    /** Metal the jeweller gave (gold | silver | rose_gold | platinum): wins over what the analyst reads off the photo. */
    metal?: string;
    targets: {
      index: number;
      kind: string;
      prompt: string;
      motionPrompt?: string;
      outputKey: string;
      width: number;
      height: number;
    }[];
    doneImages?: number[];
  };
  /** CAMPAIGN (video) jobs: which notebook renders the clips — detailed (Wan 2.2 A14B, default) or fast (TI2V-5B). */
  videoEngine?: 'detailed' | 'fast';
  /** VOICE jobs: the voiceover to speak. */
  voice?: { voiceoverId: string; outputKey: string };
  /** Clip keys already rendered and stored — skipped when the job continues in a new Kaggle session. */
  done?: string[];
  /**
   * Jobs queued together (one per scene / shot / clip, so several Kaggle accounts render them in parallel) share it.
   * The UI shows the batch as one notebook status; the last clip of a video batch queues the merge.
   */
  batchId?: string;
  /**
   * Rendered inside another job (a warm session took this waiting job's clips / images into the one it was starting,
   * to pipeline them on its two GPUs): that job's id. Such a job is DONE, joins that job's batch and is left out of
   * the batch status.
   */
  mergedInto?: string;
  /** Work job running inside a warm WORKER session: that session's job id. */
  sessionJobId?: string | null;
  /** WORKER jobs: what the warm session is doing. */
  session?: WorkerSessionPayload;
  /** SETUP jobs for a ready account that only (re)build its model cache dataset. */
  cacheOnly?: boolean;
}
