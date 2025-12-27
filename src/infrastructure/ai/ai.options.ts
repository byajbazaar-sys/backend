export class AIOptions {
  public openaiApiKey: string;
  public geminiApiKey: string;
  public claudeApiKey: string;
  constructor(openaiApiKey: string, geminiApiKey: string, claudeApiKey: string) {
    this.openaiApiKey = openaiApiKey;
    this.geminiApiKey = geminiApiKey;
    this.claudeApiKey = claudeApiKey;
  }
}
