/** Where the shoot happens. */
export const PHOTOSHOOT_SETTINGS = ['showroom', 'studio', 'wedding', 'festive'] as const;

export type PhotoshootSetting = (typeof PHOTOSHOOT_SETTINGS)[number];
