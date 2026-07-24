import type { AiImageInput } from '../interfaces/ai-media.types';
import type { TryOnJewelleryType } from '../../../application/features/try-on/jewellery-types';

const JEWELLERY_ORDER: TryOnJewelleryType[] = [
  'necklace',
  'chain',
  'pendant',
  'earring',
  'nose-pin',
  'nose-ring',
  'ring-ladies',
  'ring-gents',
  'bracelet',
  'payal',
  'anklet',
  'other',
];

/** Stable reference order for prompt image map. */
export function orderJewelleryItems(items: AiImageInput[]): AiImageInput[] {
  const copy = [...items];
  return copy.sort((a, b) => {
    const rank = (type?: AiImageInput['type']) => {
      const idx = JEWELLERY_ORDER.indexOf(type ?? 'other');
      return idx === -1 ? JEWELLERY_ORDER.length : idx;
    };
    return rank(a.type) - rank(b.type);
  });
}

/** Person first, then jewellery in stable order. */
export function buildTryOnImageSequence(
  personImage: AiImageInput,
  jewelleryItems: AiImageInput[],
): AiImageInput[] {
  return [personImage, ...orderJewelleryItems(jewelleryItems)];
}
