import type { TryOnAssetType } from '../models';
import { TryOnAsset, CreateTryOnAssetData } from '../domain';

export const TRY_ON_ASSETS_REPOSITORY = 'TRY_ON_ASSETS_REPOSITORY';

export interface ITryOnAssetsRepository {
  insert(data: CreateTryOnAssetData): Promise<TryOnAsset>;
  findByUserId(userId: string, type?: TryOnAssetType): Promise<TryOnAsset[]>;
  findByIdForUser(userId: string, id: string): Promise<TryOnAsset>;
  deleteByIdForUser(userId: string, id: string): Promise<boolean>;
}
