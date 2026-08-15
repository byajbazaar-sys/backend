import { GeneratedAiImage } from '../interfaces';
import { ProductImageInput } from './product-image-input';

export const PRODUCT_IMAGE_AI_SERVICE = 'PRODUCT_IMAGE_AI_SERVICE';

export interface IProductImageAiService {
  /**
   * Preview step: remove studio backdrop and return product on solid white (#FFFFFF).
   */
  removeProductBackground(image: ProductImageInput): Promise<GeneratedAiImage>;

  /**
   * Save step: AI transparent cutout for Magic Try-On storage (preserves edge quality).
   */
  removeProductBackgroundForStorage(image: ProductImageInput): Promise<GeneratedAiImage>;

  /**
   * Save step: runs AI transparent cutout on the uploaded image.
   */
  prepareTryOnStorageImage(image: ProductImageInput): Promise<GeneratedAiImage>;

  /** Resize/compress PNG for API preview responses (keeps payloads small). */
  compressPngForPreview(image: ProductImageInput): Promise<GeneratedAiImage>;
}
