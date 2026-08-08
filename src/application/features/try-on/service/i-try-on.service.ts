import type {
  CreateTryOnJobRequestModel,
  RecolorTryOnRequestModel,
  TryOnAssetResponseModel,
} from '../models';
import type { TryOnJobRecord } from '../interfaces';
import type { TryOnLambdaPayload } from './try-on-lambda-payload';
import type { UploadTryOnAssetInput } from './upload-try-on-asset-input';

export interface ITryOnService {
  startTryOnJob(userId: string, body: CreateTryOnJobRequestModel): Promise<TryOnJobRecord>;
  startRecolorJob(userId: string, body: RecolorTryOnRequestModel): Promise<TryOnJobRecord>;
  getJob(userId: string, jobId: string): Promise<TryOnJobRecord>;
  processJob(payload: TryOnLambdaPayload): Promise<TryOnJobRecord>;
  uploadAsset(userId: string, input: UploadTryOnAssetInput): Promise<TryOnAssetResponseModel>;
  listAssets(userId: string, type?: string): Promise<TryOnAssetResponseModel[]>;
  deleteAsset(userId: string, assetId: string): Promise<void>;
}
