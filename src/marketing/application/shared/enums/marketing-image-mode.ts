/**
 * How product images are made:
 *  - exact: the real product is cut out and kept pixel-for-pixel; AI only paints the scene around it (most accurate);
 *  - ai:    FLUX.2 [klein] re-imagines the whole shot from the product photo (more creative, details may drift).
 */
export const MARKETING_IMAGE_MODES = ['exact', 'ai'] as const;

export type MarketingImageMode = (typeof MARKETING_IMAGE_MODES)[number];

export const DEFAULT_MARKETING_IMAGE_MODE: MarketingImageMode = 'exact';
