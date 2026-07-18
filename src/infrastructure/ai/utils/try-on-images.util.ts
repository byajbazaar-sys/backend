import type { AiImageInput } from '../interfaces/ai-media.types';

const JEWELLERY_ORDER: AiImageInput['type'][] = ['necklace', 'earring', 'bracelet', 'ring', 'other'];

/** Stable reference order: necklace → earring → other types (matches prompt image map). */
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
