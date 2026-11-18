/** Output shape → pixel size sent to the image model. */
export const PHOTOSHOOT_ASPECTS = {
  '3:4': { width: 768, height: 1024 },
  '1:1': { width: 1024, height: 1024 },
  '4:5': { width: 864, height: 1080 },
  '9:16': { width: 720, height: 1280 },
} as const;

export type PhotoshootAspect = keyof typeof PHOTOSHOOT_ASPECTS;
