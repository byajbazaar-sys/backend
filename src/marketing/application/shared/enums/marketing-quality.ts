/** fast = 480×832 render (quicker on free GPUs), hd = 704×1280. Both upscaled to 1080×1920. */
export const MARKETING_QUALITIES = ['fast', 'hd'] as const;

export type MarketingQuality = (typeof MARKETING_QUALITIES)[number];
