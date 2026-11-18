import { ImageNotebookTarget } from './image-notebook-target';

export interface ImageNotebookJob {
  jobId: string;
  token: string;
  wsUrl: string;
  apiBaseUrl?: string;
  sourceImageUrl?: string;
  type: 'campaign' | 'photoshoot' | 'logo';
  title: string;
  style?: string;
  targets: ImageNotebookTarget[];
}
