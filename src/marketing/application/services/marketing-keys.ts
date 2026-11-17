/** Object keys in the marketing bucket. Versioned with a timestamp so a regenerated asset never serves a cached old file. */
export const MarketingKeys = {
  source: (userId: string, campaignId: string, ext: string) => `campaigns/${userId}/${campaignId}/source.${ext}`,
  sceneImage: (userId: string, campaignId: string, index: number) =>
    `campaigns/${userId}/${campaignId}/scene-${index}-${Date.now()}.jpg`,
  sceneVideo: (userId: string, campaignId: string, index: number) =>
    `campaigns/${userId}/${campaignId}/scene-${index}-${Date.now()}.mp4`,
  merged: (userId: string, campaignId: string) => `campaigns/${userId}/${campaignId}/merged-${Date.now()}.mp4`,
  logoImage: (userId: string) => `brands/${userId}/logo-${Date.now()}.jpg`,
  logoVideo: (userId: string) => `brands/${userId}/logo-${Date.now()}.mp4`,
  campaignPrefix: (userId: string, campaignId: string) => `campaigns/${userId}/${campaignId}/`,
};

export const sceneClipKey = (index: number) => `scene-${index}`;
export const LOGO_CLIP_KEY = 'logo';
export const sceneIndexFromClipKey = (key: string): number | null => {
  const m = /^scene-(\d+)$/.exec(key);
  return m ? Number(m[1]) : null;
};
