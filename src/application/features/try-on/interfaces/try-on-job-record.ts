import { GeneratedImage } from './generated-image';
import { TryOnJobStatus } from './try-on-job-status';

export interface TryOnJobRecord {
  jobId: string;
  userId: string;
  status: TryOnJobStatus;
  mode: 'jewellery' | 'outfit' | 'recolor';
  error?: string;
  images?: GeneratedImage[];
  createdAt: string;
  updatedAt: string;
}
