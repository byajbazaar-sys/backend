import { JewelleryTryOnRequest, OutfitRecolorRequest } from '../../features';
import { GeneratedAiImage } from '../interfaces';

export const TRY_ON_AI_SERVICE = 'TRY_ON_AI_SERVICE';

export interface ITryOnAiService {
  generateJewelleryTryOn(request: JewelleryTryOnRequest): Promise<GeneratedAiImage>;
  generateOutfitTryOn(request: JewelleryTryOnRequest): Promise<GeneratedAiImage>;
  recolorOutfit(request: OutfitRecolorRequest): Promise<GeneratedAiImage>;
  /**
   * Generate all requested variations in one call when the provider supports it.
   * Optional for backwards compatibility with Gemini/Bedrock single-image providers.
   */
  generateTryOnImages?(request: JewelleryTryOnRequest, mode: 'jewellery' | 'outfit'): Promise<GeneratedAiImage[]>;
}
