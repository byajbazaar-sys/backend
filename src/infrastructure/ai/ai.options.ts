/** Provider used specifically for virtual try-on image generation. */
export type TryOnAiProvider = 'aivot' | 'cloudflare';

export class AIOptions {
  constructor(
    /** Set TRY_ON_PROVIDER to aivot or cloudflare. */
    public tryOnProvider: TryOnAiProvider = 'cloudflare',
  ) {}
}
