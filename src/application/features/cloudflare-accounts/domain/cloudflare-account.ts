/** A Cloudflare account whose Workers AI is used for try-on and inventory background removal. */
export interface CloudflareAccount {
  id: string;
  label: string | null;
  /** Cloudflare account ID (32 hex characters). */
  accountId: string;
  /** API token (stored as plain text); '' when missing (re-enter it). */
  apiToken: string;
  enabled: boolean;
  /** Skipped until then: daily free quota used up (resets 00:00 UTC) or the token was rejected. */
  cooldownUntil: Date | null;
  lastError: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
