export const PHOTOSHOOT_METALS = ['gold', 'silver', 'rose_gold', 'platinum', 'diamond'] as const;

export type PhotoshootMetal = (typeof PHOTOSHOOT_METALS)[number];
