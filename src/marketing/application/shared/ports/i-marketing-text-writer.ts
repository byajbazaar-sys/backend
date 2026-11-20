/** Text model for marketing copy (ad scripts, the shop name in Devanagari) and image to text (the product's look). */
export const MARKETING_TEXT_WRITER = 'MARKETING_TEXT_WRITER';

export interface IMarketingTextWriter {
  /** The model's reply to one system + user message. Throws when no text model is reachable. */
  write(system: string, user: string, options?: { temperature?: number; maxTokens?: number }): Promise<string>;
  /** The vision model's answer about a photo. Throws when no vision model is reachable. */
  see(image: Buffer, prompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string>;
}
