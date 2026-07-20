import type { TryOnAssetType } from '../models';
import { TryOnAsset } from '../domain';

export const TRY_ON_ASSETS_REPOSITORY = 'TRY_ON_ASSETS_REPOSITORY';

export interface ITryOnAssetsRepository {
  insert(data: {
    id: string;
    userId: string;
    type: TryOnAssetType;
    imageKey: string;
    label?: string;
    heightInInches?: number;
    color?: string;
    createdAt?: Date;
  }): Promise<TryOnAsset>;
  findByUserId(userId: string, type?: TryOnAssetType): Promise<TryOnAsset[]>;
  findByIdForUser(userId: string, id: string): Promise<TryOnAsset | null>;
  deleteByIdForUser(userId: string, id: string): Promise<boolean>;
}
