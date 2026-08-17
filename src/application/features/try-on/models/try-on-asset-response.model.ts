import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { TRY_ON_ASSET_TYPES, type TryOnAssetType } from './try-on-asset-types';

export class TryOnAssetResponseModel {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty({ enum: TRY_ON_ASSET_TYPES })
  type!: TryOnAssetType;

  @Expose()
  @ApiProperty()
  imageUrl!: string;

  @Expose()
  @ApiProperty()
  imageKey!: string;

  @Expose()
  @ApiPropertyOptional()
  label?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Height / length in inches (jewellery proportion lock)' })
  heightInInches?: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Default outfit color hex for custom outfits' })
  color?: string;

  @Expose()
  @ApiPropertyOptional()
  createdAt?: string;
}
