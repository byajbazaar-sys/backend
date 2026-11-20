/**
 * How a campaign's clips are rendered. detailed = Wan 2.2 I2V A14B first-last-frame (slower, the most faithful
 * jewellery); fast = Wan 2.2 TI2V-5B on both GPUs at once (several times quicker, looser motion). Both lock the real
 * product into every frame.
 */
export const MARKETING_VIDEO_ENGINES = ['detailed', 'fast'] as const;

export type MarketingVideoEngine = (typeof MARKETING_VIDEO_ENGINES)[number];
