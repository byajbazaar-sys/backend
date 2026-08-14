import { TryOnImageInput } from './try-on-image-input';
import { TryOnJewelleryItemInput } from './try-on-jewellery-item-input';
import type { TryOnOccasion } from './try-on-occasion';

export interface JewelleryTryOnRequest {
  personImage: TryOnImageInput;
  jewelleryItems: TryOnJewelleryItemInput[];
  outfit: string;
  occasion?: TryOnOccasion | string;
  color?: string;
  variations?: number;
  cloudflareModel?: string;
}
