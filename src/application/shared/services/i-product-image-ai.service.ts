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
}
