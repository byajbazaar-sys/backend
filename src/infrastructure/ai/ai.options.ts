export type AiProvider = 'bedrock' | 'gemini';

/** Provider used specifically for virtual try-on image generation. */
export type TryOnAiProvider = 'bedrock' | 'gemini' | 'aivot' | 'replicate' | 'cloudflare';

export class AIOptions {
  constructor(
    public openaiApiKey: string,
    public geminiApiKey: string,
    public claudeApiKey: string,
    public provider: AiProvider = 'bedrock',
    public geminiApiKeys: string[] = [],
    public bedrockRegion = 'ap-south-1',
    public bedrockModelId = 'global.amazon.nova-2-lite-v1:0',
    /** Defaults to AI_PROVIDER when unset; set TRY_ON_PROVIDER=aivot to use Aivot. */
    public tryOnProvider: TryOnAiProvider = 'bedrock',
  ) {}
}
