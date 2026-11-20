/**
 * Where the setup notebook publishes an account's model cache: a private Kaggle dataset (with the account's own
 * credentials), or a gs:// prefix in the Colab account's bucket (written with the notebook's service account).
 */
export type ModelCacheTarget =
  | { provider: 'kaggle'; username: string; key: string }
  | { provider: 'colab'; gcsPrefix: string };
