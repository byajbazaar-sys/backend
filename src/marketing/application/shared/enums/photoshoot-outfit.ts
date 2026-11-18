/** The model's outfit (women) — men always wear a kurta / sherwani look. */
export const PHOTOSHOOT_OUTFITS = ['kurta', 'saree', 'lehenga', 'western'] as const;

export type PhotoshootOutfit = (typeof PHOTOSHOOT_OUTFITS)[number];
