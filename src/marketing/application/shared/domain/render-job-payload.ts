import { RenderClipSpec } from './render-clip-spec';

export interface RenderJobPayload {
  clips: RenderClipSpec[];
  imageGeneration?: {
    type: 'campaign' | 'photoshoot' | 'logo';
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
}
