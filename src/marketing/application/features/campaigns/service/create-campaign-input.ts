export interface CreateCampaignInput {
  inventoryItemId?: string;
  image?: { base64: string; mimeType: string };
  title?: string;
  style?: string;
  quality?: string;
  /** exact = keep the real product, new background (default); ai = full AI scene. */
  imageMode?: string;
}
