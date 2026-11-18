import { TryOnImageInput } from './try-on-image-input';
import type { TryOnJewelleryType } from '../utils';

export interface TryOnJewelleryItemInput extends TryOnImageInput {
  type: TryOnJewelleryType;
  heightInInches?: number;
}
