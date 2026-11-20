/** Sampling settings of the ChatterBox Multilingual node (same names and ranges as in ComfyUI). */
export interface VoiceoverSettings {
  /** Narration speed, 0.7-1.4 (1 = as spoken); the pitch stays the same. Older voiceovers have none (= 1). */
  speed?: number;
  /** Emotion intensity, 0-2 (default 0.5). */
  exaggeration: number;
  /** Classifier-free guidance, 0-1 (default 0.5). */
  cfgWeight: number;
  /** Randomness, 0.05-2 (default 0.8). */
  temperature: number;
  /** 1-5 (default 2). */
  repetitionPenalty: number;
  /** 0-1 (default 0.05). */
  minP: number;
  /** 0.1-1 (default 1). */
  topP: number;
  /** Same seed + same inputs = the same take. */
  seed: number;
}
