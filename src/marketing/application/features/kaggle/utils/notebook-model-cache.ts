import { ComfyModelFile } from './model-cache';

/**
 * What the setup notebook publishes as the account's model cache: a private Kaggle dataset (with the account's own
 * credentials), or a gs:// prefix in a Colab Enterprise account's bucket (written as the notebook's service account).
 */
export interface NotebookModelCache {
  provider: 'kaggle' | 'colab';
  /** Kaggle: "user/slug". Colab: "gs://bucket/byajbazaar-models/slug". */
  dataset: string;
  /** Kaggle only. */
  username?: string;
  key?: string;
  comfy: ComfyModelFile[];
  hf: string[];
}
