export class ReplicateTryOnOptions {
  constructor(
    public apiToken: string = '',
    /** Replicate model slug, e.g. black-forest-labs/flux-2-pro */
    public modelId: string = 'black-forest-labs/flux-2-pro',
    /** Per-request timeout in milliseconds */
    public timeoutMs: number = 120_000,
    /** Max retries for transient failures */
    public maxRetries: number = 2,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.apiToken?.trim());
  }
}
