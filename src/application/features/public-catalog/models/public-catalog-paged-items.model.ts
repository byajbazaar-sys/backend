import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { PublicCatalogItemModel } from './public-catalog-item.model';

export class PublicCatalogPagedItemsModel {
  @Expose()
  @Type(() => PublicCatalogItemModel)
  @ApiProperty({ type: [PublicCatalogItemModel] })
  items: PublicCatalogItemModel[];

  @Expose()
  @ApiProperty()
  pageNumber: number;

  @Expose()
  @ApiProperty()
  pageSize: number;

  @Expose()
  @ApiProperty()
  totalCount: number;

  @Expose()
  @ApiProperty()
  totalPages: number;
}
