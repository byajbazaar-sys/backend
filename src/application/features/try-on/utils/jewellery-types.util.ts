export const TRY_ON_JEWELLERY_TYPES = [
  'necklace',
  'earring',
  'ring-ladies',
  'ring-gents',
  'chain',
  'pendant',
  'nose-pin',
  'nose-ring',
  'payal',
  'bracelet',
  'anklet',
  'other',
] as const;

export type TryOnJewelleryType = (typeof TRY_ON_JEWELLERY_TYPES)[number];

export const AIVOT_JEWELLERY_TYPES: TryOnJewelleryType[] = ['necklace', 'earring'];

export function isAivotCompatibleType(type?: string): boolean {
  return !!type && AIVOT_JEWELLERY_TYPES.includes(type as TryOnJewelleryType);
}

export function requiresCloudflareOnly(jewelleryTypes: string[]): boolean {
  return jewelleryTypes.some((t) => !isAivotCompatibleType(t));
}
