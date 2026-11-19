import type { TryOnJewelleryType } from '../../../application';

export type { TryOnJewelleryType };

export interface AiImageInput {
  base64: string;
  mimeType: string;
  type?: TryOnJewelleryType;
  heightInInches?: number;
}

export interface AiJewelleryTryOnRequest {
  personImage: AiImageInput;
  jewelleryItems: AiImageInput[];
  /** Required by Aivot — non-empty string (e.g. Saree) */
  outfit: string;
  occasion?: string;
  color?: string;
  variations?: number;
  /** Cloudflare Workers AI model key: klein-9b (older values such as klein-4b resolve to 9B). */
  cloudflareModel?: string;
}

export interface AiOutfitRecolorRequest {
  image: AiImageInput;
  color: string;
}
