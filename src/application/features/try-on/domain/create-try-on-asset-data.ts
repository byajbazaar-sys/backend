import { Expose, Type } from 'class-transformer';
import type { TryOnAssetType } from '../models';

export class CreateTryOnAssetData {
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
  @Type(() => Number)
  heightInInches?: number;

  @Expose()
  color?: string;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;
}
