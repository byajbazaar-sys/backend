/**
 * What marketing needs from the ByajBazaar app. Marketing code depends only on these interfaces; the adapters in
 * infrastructure/adapters plug in the real ByajBazaar services.
 */

/** Inventory + business profile (ByajBazaar main database + bucket). */
export const MARKETING_CATALOG = 'MARKETING_CATALOG';
export interface MarketingCatalogItem {
  id: string;
  itemName: string;
  metalType?: string;
  purity?: string;
  categoryName?: string;
  /** Storage key (or URL) of the item's main photo. */
  imageKey?: string;
}
export interface IMarketingCatalog {
  findItem(userId: string, itemId: string): Promise<MarketingCatalogItem | null>;
  readImage(imageKey: string): Promise<Buffer>;
  businessName(userId: string): Promise<string | null>;
}

/** Live updates to the user's open app sessions (ByajBazaar AWS WebSocket). */
export const MARKETING_NOTIFIER = 'MARKETING_NOTIFIER';
export interface IMarketingNotifier {
  notifyUser(userId: string, payload: Record<string, unknown>): Promise<void>;
}

export interface GeneratedImageData {
  base64: string;
  mimeType: string;
}

/** Cloudflare Workers AI: image-to-image (existing FLUX model), text-to-image (logos) and a cheap text model. */
export const MARKETING_AI = 'MARKETING_AI';
export interface IMarketingAi {
  imageToImage(
    image: GeneratedImageData,
    prompt: string,
    size: { width: number; height: number },
  ): Promise<GeneratedImageData>;
  textToImage(prompt: string, size: { width: number; height: number }): Promise<GeneratedImageData>;
  /** Returns the model's text reply. */
  generateText(system: string, user: string, options?: { maxTokens?: number; temperature?: number }): Promise<string>;
}
