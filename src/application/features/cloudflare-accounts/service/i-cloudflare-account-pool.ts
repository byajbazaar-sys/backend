import { CloudflarePoolSummary } from './cloudflare-pool-summary';
import { CloudflareTokenCheck } from './cloudflare-token-check';

export const CLOUDFLARE_ACCOUNT_POOL = 'CLOUDFLARE_ACCOUNT_POOL';

/** The Workers AI account rotation (infrastructure). */
export interface ICloudflareAccountPool {
  /** Drops the cached account list so the next call reads the database (after an admin change). */
  invalidate(): void;
  /** Checks that the token is valid and can run Workers AI on that account. */
  verify(accountId: string, apiToken: string): Promise<CloudflareTokenCheck>;
  summary(): Promise<CloudflarePoolSummary>;
  /** CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN pairs, for importing them into the database. */
  envCredentials(): { accountId: string; apiToken: string }[];
}
