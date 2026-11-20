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

  /** Workers AI chat model (prompt / script writing); `model` overrides the default one. Returns the reply text. */
  generateText(
    system: string,
    user: string,
    options?: { maxTokens?: number; temperature?: number; model?: string },
  ): Promise<string>;

  /** Image to text: a multimodal Workers AI model answers `prompt` about the photo. Returns the reply text. */
  describeImage(
    image: Buffer,
    prompt: string,
    options?: { maxTokens?: number; temperature?: number; model?: string },
  ): Promise<string>;
}
