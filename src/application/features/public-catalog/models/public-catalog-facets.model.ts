import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { PublicCatalogCategoryFacetModel } from './public-catalog-category-facet.model';

/** Filter options for the whole published catalog (only for details the shop shows). */
export class PublicCatalogFacetsModel {
  @Expose()
  @Type(() => PublicCatalogCategoryFacetModel)
  @ApiPropertyOptional({ type: [PublicCatalogCategoryFacetModel] })
  categories?: PublicCatalogCategoryFacetModel[];

  @Expose()
  @ApiPropertyOptional({ type: [String] })
  metals?: string[];

  @Expose()
  @ApiPropertyOptional({ type: [String] })
  purities?: string[];

  @Expose()
  @ApiPropertyOptional({ type: [String] })
  sizes?: string[];

  @Expose()
  @ApiPropertyOptional()
  hallmarkedCount?: number;

  @Expose()
  @ApiPropertyOptional()
  minWeight?: number;

  @Expose()
  @ApiPropertyOptional()
  maxWeight?: number;

  @Expose()
  @ApiPropertyOptional()
  minPrice?: number;

  @Expose()
  @ApiPropertyOptional()
  maxPrice?: number;
}
