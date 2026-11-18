export interface CreateCampaignInput {
  inventoryItemId?: string;
  image?: { base64: string; mimeType: string };
  title?: string;
  style?: string;
  quality?: string;
}
