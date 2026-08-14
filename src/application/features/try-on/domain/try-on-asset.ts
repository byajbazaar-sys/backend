import { Expose } from 'class-transformer';

import type { TryOnAssetType } from '../models';

export class TryOnAsset {
  @Expose()
  id: string;

  @Expose()
  userId: string;

  @Expose()
  type: TryOnAssetType;

  @Expose()
  imageKey: string;

  @Expose()
  label?: string;

  @Expose()
  heightInInches?: number;

  @Expose()
  color?: string;

  @Expose()
  createdAt: Date;
}
