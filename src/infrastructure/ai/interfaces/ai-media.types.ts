import type { TryOnJewelleryType } from '../../../application/features/try-on/jewellery-types';

export type { TryOnJewelleryType };

export interface AiImageInput {
  base64: string;
  mimeType: string;
  type?: TryOnJewelleryType;
  heightInInches?: number;
}

export interface JewelleryTryOnRequest {
  personImage: AiImageInput;
  jewelleryItems: AiImageInput[];
  /** Required by Aivot — non-empty string (e.g. Saree) */
  outfit: string;
  occasion?: string;
  color?: string;
  variations?: number;
  /** Cloudflare Workers AI model key: klein-4b | klein-9b */
  cloudflareModel?: string;
}

export interface OutfitRecolorRequest {
  image: AiImageInput;
  color: string;
}
