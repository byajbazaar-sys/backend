import { CloudflareAccount } from '../domain';

export const CLOUDFLARE_ACCOUNTS_REPOSITORY = 'CLOUDFLARE_ACCOUNTS_REPOSITORY';

export interface CloudflareAccountCreate {
  label: string | null;
  accountId: string;
  apiToken: string;
  enabled: boolean;
}

export interface CloudflareAccountChanges {
  label?: string | null;
  apiToken?: string;
  enabled?: boolean;
  cooldownUntil?: Date | null;
  lastError?: string | null;
  lastUsedAt?: Date;
}

/** Table cloudflare_accounts (main database). Tokens are stored as plain text. Usage logs go to the logs database. */
export interface ICloudflareAccountsRepository {
  list(): Promise<CloudflareAccount[]>;
  count(): Promise<number>;
  find(id: string): Promise<CloudflareAccount | null>;
  findByAccountId(accountId: string): Promise<CloudflareAccount | null>;
  create(account: CloudflareAccountCreate): Promise<CloudflareAccount>;
  update(id: string, changes: CloudflareAccountChanges): Promise<CloudflareAccount | null>;
  delete(id: string): Promise<boolean>;
}
