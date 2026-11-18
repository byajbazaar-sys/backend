export const PHOTOSHOOT_MODELS = ['woman', 'man'] as const;

export type PhotoshootModel = (typeof PHOTOSHOOT_MODELS)[number];
