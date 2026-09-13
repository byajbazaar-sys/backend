import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { EMetalType } from '../../inventory/enums';

export class PublicCatalogItemModel {
  @Expose()
  @ApiPropertyOptional({ example: '3f2c1e4a-9b8d-4c2a-a111-0f9e8d7c6b5a' })
  id?: string;

  @Expose()
  @ApiProperty({ example: '22K Gold Ring' })
  itemName: string;

  @Expose()
  @ApiPropertyOptional()
  description?: string;

  @Expose()
  @ApiPropertyOptional()
  categoryName?: string;

  @Expose()
  @ApiProperty({ enum: EMetalType })
  metalType: EMetalType;

  @Expose()
  @ApiPropertyOptional()
  purity?: string;

  @Expose()
  @ApiPropertyOptional()
  grossWeight?: number;

  @Expose()
  @ApiPropertyOptional()
  netWeight?: number;

  @Expose()
  @ApiPropertyOptional()
  sellingPrice?: number;

  @Expose()
  @ApiPropertyOptional({ type: [String] })
  imageUrls?: string[];

  @Expose()
  @ApiPropertyOptional()
  hallmarked?: boolean;
}
