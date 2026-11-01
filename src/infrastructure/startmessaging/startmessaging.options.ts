export class StartMessagingOptions {
  constructor(
    public readonly apiKey: string,
    public readonly templateId: string,
    public readonly appName: string,
    public readonly timeoutMs: number,
  ) {
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs >= 1_000 && timeoutMs <= 30_000 ? timeoutMs : 10_000;
  }
}
