export interface AiImageInput {
  base64: string;
  mimeType: string;
  type?: 'necklace' | 'earring' | 'bracelet' | 'ring' | 'other';
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
}

export interface OutfitRecolorRequest {
  image: AiImageInput;
  color: string;
}
