import type { TryOnJewelleryType } from '../jewellery-types';
import { TryOnImageInput } from './try-on-image-input';

export interface TryOnJewelleryItemInput extends TryOnImageInput {
  type: TryOnJewelleryType;
  heightInInches?: number;
}
