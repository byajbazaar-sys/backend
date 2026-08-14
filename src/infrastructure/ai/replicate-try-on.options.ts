export class ReplicateTryOnOptions {
  constructor(
    public apiToken = '',
    /** Replicate model slug, e.g. black-forest-labs/flux-2-pro */
    public modelId = 'black-forest-labs/flux-2-pro',
    /** Per-request timeout in milliseconds */
    public timeoutMs = 120_000,
    /** Max retries for transient failures */
    public maxRetries = 2,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.apiToken?.trim());
  }
}
