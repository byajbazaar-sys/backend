import { ImageNotebookTarget } from './image-notebook-target';

export interface ImageNotebookJob {
  jobId: string;
  token: string;
  wsUrl: string;
  apiBaseUrl?: string;
  sourceImageUrl?: string;
  type: 'campaign' | 'photoshoot' | 'logo';
  /** exact = cut-out product + new background; ai = full AI scene (FLUX.2 [klein]). */
  mode: 'exact' | 'ai';
  title: string;
  style?: string;
  targets: ImageNotebookTarget[];
  /** Hugging Face token for the gated FLUX.2 [klein] 9B (required). */
  hfToken?: string;
}
