import type { TryOnJewelleryType } from '../../../application/features/try-on/jewellery-types';

export type { TryOnJewelleryType } from '../../../application/features/try-on/jewellery-types';

export type TryOnOccasion =
  | 'Birthday'
  | 'Wedding'
  | 'Party'
  | 'Festive'
  | 'Casual'
  | 'Formal'
  | 'Daily';

export interface TryOnImageInput {
  base64: string;
  mimeType: string;
}

export interface TryOnJewelleryItemInput extends TryOnImageInput {
  type: TryOnJewelleryType;
  /** Physical height in inches — used for proportion lock in prompts */
  heightInInches?: number;
}

export interface JewelleryTryOnRequest {
  personImage: TryOnImageInput;
  jewelleryItems: TryOnJewelleryItemInput[];
  /** Required by Aivot — non-empty outfit label (e.g. Saree) */
  outfit: string;
  occasion?: TryOnOccasion | string;
  color?: string;
  /** How many result variations to generate (1–2) */
  variations?: number;
  /** Cloudflare Workers AI model key: klein-4b | klein-9b */
  cloudflareModel?: string;
}

export interface OutfitRecolorRequest {
  image: TryOnImageInput;
  color: string;
}

export interface GeneratedImage {
  base64: string;
  mimeType: string;
}

export type TryOnJobStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface TryOnJobRecord {
  jobId: string;
  userId: string;
  status: TryOnJobStatus;
  mode: 'jewellery' | 'outfit' | 'recolor';
  error?: string;
  images?: GeneratedImage[];
  createdAt: string;
  updatedAt: string;
}
