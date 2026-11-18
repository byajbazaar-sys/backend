import { ComfyModelFile } from './model-cache';

/** What the setup notebook publishes as the account's private model dataset, and the credentials to do it. */
export interface NotebookModelCache {
  /** "user/slug". */
  dataset: string;
  username: string;
  key: string;
  comfy: ComfyModelFile[];
  hf: string[];
}
