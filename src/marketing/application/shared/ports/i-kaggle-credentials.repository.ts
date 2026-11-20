import { KaggleCredential } from '../domain';
export const KAGGLE_CREDENTIALS_REPOSITORY = 'KAGGLE_CREDENTIALS_REPOSITORY';

/** GPU account credentials (Kaggle API keys, Colab Enterprise service-account keys), managed by admins. */
export interface IKaggleCredentialsRepository {
  list(filter?: { enabled?: boolean }): Promise<KaggleCredential[]>;
  find(username: string): Promise<KaggleCredential | null>;
  create(credential: Omit<KaggleCredential, 'id' | 'createdAt' | 'updatedAt'>): Promise<KaggleCredential>;
  update(
    username: string,
    patch: Partial<Pick<KaggleCredential, 'apiKey' | 'concurrency' | 'enabled' | 'label' | 'colab'>>,
  ): Promise<KaggleCredential | null>;
  /** False when no such account. */
  delete(username: string): Promise<boolean>;
}
