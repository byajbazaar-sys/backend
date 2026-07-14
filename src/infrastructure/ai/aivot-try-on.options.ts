export class AivotTryOnOptions {
  constructor(
    /** Base URL without trailing slash, e.g. https://tryon.aivot.ai/api/v1 */
    public baseUrl: string = '',
    /** Per-request timeout in milliseconds */
    public timeoutMs: number = 90_000,
    /** Max retries for transient HTTP failures */
    public maxRetries: number = 2,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.baseUrl?.trim());
  }
}
