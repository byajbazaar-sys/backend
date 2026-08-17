import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { PublicCatalogPagedItemsModel } from './public-catalog-paged-items.model';

export class PublicCatalogResponseModel {
  @Expose()
  @ApiProperty({ example: 'Shri R.K. Jewellers' })
  businessName: string;

  @Expose()
  @ApiProperty({ example: 'shri-rk-jewellers' })
  catalogSlug: string;

  @Expose()
  @ApiPropertyOptional()
  shopLogoUrl?: string;

  @Expose()
  @ApiPropertyOptional()
  address?: string;

  @Expose()
  @ApiPropertyOptional()
  phoneNumber?: string;

  @Expose()
  @ApiProperty({ example: true })
  catalogEnabled: boolean;

  @Expose()
  @ApiProperty({ example: true })
  catalogActive: boolean;

  @Expose()
  @ApiPropertyOptional({ example: '#1a1520', description: 'Jewellery image backdrop colour for catalog thumbnails' })
  tryOnBackgroundColor?: string;

  @Expose()
  @Type(() => PublicCatalogPagedItemsModel)
  @ApiProperty({ type: PublicCatalogPagedItemsModel })
  catalog: PublicCatalogPagedItemsModel;
}
