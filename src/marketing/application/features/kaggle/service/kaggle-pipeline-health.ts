import { KaggleWorkNotebook } from '../utils';

/** One notebook pipeline (image or video) across every account. */
export interface KagglePipelineHealth {
  notebook: KaggleWorkNotebook;
  state: 'running' | 'starting' | 'waiting' | 'idle' | 'failing';
  running: number;
  starting: number;
  waiting: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastFailure: string | null;
  recentDone: number;
  recentFailed: number;
}
