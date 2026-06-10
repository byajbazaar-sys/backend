import { ApiProperty } from '@nestjs/swagger';
import { IPageable } from '@shared-libs';
import { Expose, Type } from 'class-transformer';
import { InventoryItemResponseModel } from './inventory-item-response.model';

export class InventoryItemsPagedResponseModel implements IPageable<InventoryItemResponseModel> {
  @Expose()
  @Type(() => InventoryItemResponseModel)
  @ApiProperty({ type: [InventoryItemResponseModel] })
  items: InventoryItemResponseModel[];

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  page: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  perPage: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  totalPages: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  totalCount: number;

  @Expose()
  @ApiProperty()
  hasNextPage: boolean;

  @Expose()
  @ApiProperty()
  hasPreviousPage: boolean;
}
