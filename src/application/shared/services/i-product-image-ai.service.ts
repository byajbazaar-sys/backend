import { GeneratedAiImage } from '../interfaces';
import { ProductImageInput } from './product-image-input';

export const PRODUCT_IMAGE_AI_SERVICE = 'PRODUCT_IMAGE_AI_SERVICE';

export interface IProductImageAiService {
  /**
   * Returns a new image with the background cleared. Does not mutate the input.
   */
  removeProductBackground(image: ProductImageInput): Promise<GeneratedAiImage>;

  /** Force near-white pixels transparent on an existing PNG cutout. */
  polishTransparentPng(image: ProductImageInput): Promise<GeneratedAiImage>;

  /** Resize/compress PNG for API preview responses (keeps payloads small). */
  compressPngForPreview(image: ProductImageInput): Promise<GeneratedAiImage>;
}
