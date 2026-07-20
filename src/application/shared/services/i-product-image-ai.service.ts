import { GeneratedAiImage } from '../interfaces';

export const PRODUCT_IMAGE_AI_SERVICE = 'PRODUCT_IMAGE_AI_SERVICE';

export interface ProductImageInput {
  base64: string;
  mimeType: string;
}

export interface IProductImageAiService {
  /**
   * Returns a new image with the background cleared. Does not mutate the input.
   */
  removeProductBackground(image: ProductImageInput): Promise<GeneratedAiImage>;
}
