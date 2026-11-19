/** API credentials of one Kaggle account (kaggle_credentials). `apiKey` is stored as plain text. */
export interface KaggleCredential {
  id: string;
  /** Kaggle username (lower-case); also the worker id used in kernel refs and kaggle_accounts. */
  username: string;
  /** Legacy API key (kaggle.json) or a `KGAT_…` access token. */
  apiKey: string;
  /** Parallel notebooks this account may run (1–4). */
  concurrency: number;
  /** Disabled accounts are kept but not used for renders. */
  enabled: boolean;
  label?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
