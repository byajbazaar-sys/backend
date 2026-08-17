import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { TryOnAssetResponseModel } from './try-on-asset-response.model';

export class TryOnAssetsListResponseModel {
  @Expose()
  @ApiProperty({ type: [TryOnAssetResponseModel] })
  @Type(() => TryOnAssetResponseModel)
  items!: TryOnAssetResponseModel[];
}
