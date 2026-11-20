/**
 * A Colab Enterprise (Vertex AI notebook execution) account. The service-account key JSON itself is the credential's
 * `apiKey`; these are the settings that go with it.
 */
export interface ColabEnterpriseConfig {
  /** Google Cloud project id (read from the key when not given). */
  projectId: string;
  /** Region with T4 / L4 GPUs for Colab Enterprise, e.g. asia-south1, us-central1. */
  region: string;
  /** Cloud Storage bucket (name only) for run outputs and the model cache; same region keeps copies fast and free. */
  bucket: string;
  /** The service account the notebook runs as (the key's own account when not given). */
  serviceAccountEmail: string;
  /** Compute: n1-standard-8 + 2 × NVIDIA_TESLA_T4 matches Kaggle's T4 × 2 so the same notebooks run unchanged. */
  machineType: string;
  acceleratorType: 'NVIDIA_TESLA_T4' | 'NVIDIA_L4';
  acceleratorCount: number;
  /** Boot disk in GB (models + ComfyUI + outputs need ~150). */
  diskSizeGb: number;
  /** Hard cap on one session's running time (billing safety): the session hands over before it. */
  maxSessionHours: number;
}
