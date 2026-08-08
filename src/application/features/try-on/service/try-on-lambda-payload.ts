import type { TryOnProviderRoute } from '../../../shared';
import type { JewelleryTryOnRequest, OutfitRecolorRequest } from '../interfaces';

export interface TryOnLambdaPayload {
  jobId: string;
  userId: string;
  mode: 'jewellery' | 'outfit' | 'recolor';
  request: JewelleryTryOnRequest | OutfitRecolorRequest;
  variations: number;
  providerRoute?: TryOnProviderRoute;
}
