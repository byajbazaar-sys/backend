import { KaggleCredential } from '../domain';
export const KAGGLE_CREDENTIALS_REPOSITORY = 'KAGGLE_CREDENTIALS_REPOSITORY';

/** Kaggle API credentials, managed by admins. Implementations encrypt `apiKey` at rest. */
export interface IKaggleCredentialsRepository {
  list(filter?: { enabled?: boolean }): Promise<KaggleCredential[]>;
  find(username: string): Promise<KaggleCredential | null>;
  create(credential: Omit<KaggleCredential, 'id' | 'createdAt' | 'updatedAt'>): Promise<KaggleCredential>;
  update(
    username: string,
    patch: Partial<Pick<KaggleCredential, 'apiKey' | 'concurrency' | 'enabled' | 'label'>>,
  ): Promise<KaggleCredential | null>;
  /** False when no such account. */
  delete(username: string): Promise<boolean>;
}
