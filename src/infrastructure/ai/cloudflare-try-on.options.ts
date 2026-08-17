export interface CloudflareCredential {
  accountId: string;
  apiToken: string;
}

export function parseCloudflareCredentials(accountIdsRaw: string, tokensRaw: string): CloudflareCredential[] {
  const tokens = tokensRaw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  const accountIds = accountIdsRaw
    .split(',')
    .map((accountId) => accountId.trim())
    .filter(Boolean);

  if (!tokens.length) {
    return [];
  }

  const fallbackAccountId = accountIds[0] || '';
  return tokens.map((apiToken, index) => ({
    accountId: accountIds[index] || fallbackAccountId,
    apiToken,
  }));
}

export class CloudflareTryOnOptions {
  constructor(
    /** Paired account ID + API token entries (supports rotation across accounts). */
    public credentials: CloudflareCredential[] = [],
    public modelId = '@cf/black-forest-labs/flux-2-klein-9b',
    public timeoutMs = 120_000,
    public maxRetries = 2,
  ) {}

  get isConfigured(): boolean {
    return (
      this.credentials.length > 0 && this.credentials.every((entry) => entry.accountId.trim() && entry.apiToken.trim())
    );
  }
}
