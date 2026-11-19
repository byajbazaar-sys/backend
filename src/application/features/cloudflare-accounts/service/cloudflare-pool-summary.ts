/** Where the Workers AI calls get their accounts from right now. */
export interface CloudflarePoolSummary {
  /** database = accounts added in admin · env = CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN · none = not configured. */
  source: 'database' | 'env' | 'none';
  /** Accounts in rotation now (enabled, token readable, not cooling down). */
  activeAccounts: number;
  /** Accounts listed in CLOUDFLARE_API_TOKEN (used only while the database has no accounts). */
  envAccounts: number;
  model: string;
}
