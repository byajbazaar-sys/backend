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
  /** Merge of all scene videos (rendered here or already stored) ending on the logo clip. */
  merge?: { sceneKeys: string[]; outputKey: string } | null;
  /** Clip keys already rendered and stored — skipped when the job continues in a new Kaggle session. */
  done?: string[];
  /** The merged film was uploaded (no merge needed on continuation). */
  mergeDone?: boolean;
  /** Work job running inside a warm WORKER session: that session's job id. */
  sessionJobId?: string | null;
  /** WORKER jobs: what the warm session is doing. */
  session?: WorkerSessionPayload;
  /** SETUP jobs for a ready account that only (re)build its model cache dataset. */
  cacheOnly?: boolean;
}
