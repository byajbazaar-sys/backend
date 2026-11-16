import { GeneratedAiImage } from '../interfaces';
import { ProductImageInput } from './product-image-input';

export const PRODUCT_IMAGE_AI_SERVICE = 'PRODUCT_IMAGE_AI_SERVICE';

export interface IProductImageAiService {
  /**
   * AI step: remove studio backdrop and return product on solid white (#FFFFFF).
   */
  removeProductBackground(image: ProductImageInput): Promise<GeneratedAiImage>;

  /**
   * Save step: strip border-connected white backdrop for transparent try-on storage.
   */
  stripWhiteBackground(image: ProductImageInput): Promise<GeneratedAiImage>;

  /**
   * Save step: use white-backdrop preview as-is, or run AI first when the upload is still the original photo.
   */
  prepareTryOnStorageImage(image: ProductImageInput): Promise<GeneratedAiImage>;

  /** Resize/compress PNG for API preview responses (keeps payloads small). */
  compressPngForPreview(image: ProductImageInput): Promise<GeneratedAiImage>;

  /**
   * Marketing still: the product photo restaged by the image model in a styled scene
   * (used as the first frame of a marketing video). Size must be multiples of 16.
   */
  generateMarketingImage(
    image: ProductImageInput,
    prompt: string,
    size?: { width: number; height: number },
  ): Promise<GeneratedAiImage>;

  /** Text-to-image with the same model (no reference image), e.g. a logo. */
  generateImageFromText(prompt: string, size?: { width: number; height: number }): Promise<GeneratedAiImage>;

  /** Cheap Workers AI text model (prompt writing). Returns the reply text. */
  generateText(system: string, user: string, options?: { maxTokens?: number; temperature?: number }): Promise<string>;
}
