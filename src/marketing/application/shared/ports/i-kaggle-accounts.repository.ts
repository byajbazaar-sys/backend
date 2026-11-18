import { KaggleAccount } from '../domain';
import { EKaggleAccountStatus } from '../enums';
export const KAGGLE_ACCOUNTS_REPOSITORY = 'KAGGLE_ACCOUNTS_REPOSITORY';

export interface IKaggleAccountsRepository {
  list(): Promise<KaggleAccount[]>;
  find(username: string): Promise<KaggleAccount | null>;
  upsert(account: Partial<KaggleAccount> & { username: string }): Promise<KaggleAccount>;
  /** Atomically moves an account between statuses; false if it was not in `from`. */
  transition(username: string, from: EKaggleAccountStatus[], patch: Partial<KaggleAccount>): Promise<boolean>;
  /** Changes fields of an existing account (no-op when it does not exist). */
  update(username: string, patch: Partial<Omit<KaggleAccount, 'username'>>): Promise<void>;
  /** Atomically counts a finished render job on the account. */
  recordOutcome(username: string, outcome: 'completed' | 'failed'): Promise<void>;
}
