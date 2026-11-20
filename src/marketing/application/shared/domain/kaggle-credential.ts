import { ColabEnterpriseConfig } from './colab-enterprise-config';
import { GpuProvider } from './gpu-provider';

/**
 * API credentials of one GPU account (kaggle_credentials): a Kaggle account or a Colab Enterprise project.
 * `apiKey` is stored as plain text.
 */
export interface KaggleCredential {
  id: string;
  /** Kaggle username, or the id given to a Colab account (lower-case); the worker id in kernel refs and kaggle_accounts. */
  username: string;
  /** Kaggle: legacy API key (kaggle.json) or a `KGAT_…` access token. Colab: the service-account key JSON. */
  apiKey: string;
  /** kaggle (default) or colab. */
  provider: GpuProvider;
  /** Colab Enterprise settings (null for Kaggle). */
  colab?: ColabEnterpriseConfig | null;
  /** Parallel notebooks this account may run (1–4). */
  concurrency: number;
  /** Disabled accounts are kept but not used for renders. */
  enabled: boolean;
  label?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
