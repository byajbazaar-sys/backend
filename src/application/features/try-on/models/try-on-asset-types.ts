import { TRY_ON_JEWELLERY_TYPES } from '../utils';

export const TRY_ON_ASSET_TYPES = [...TRY_ON_JEWELLERY_TYPES, 'outfit', 'occasion'] as const;
export type TryOnAssetType = (typeof TRY_ON_ASSET_TYPES)[number];
