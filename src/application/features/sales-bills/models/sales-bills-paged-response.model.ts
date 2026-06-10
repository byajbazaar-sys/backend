import { ApiProperty } from '@nestjs/swagger';
import { IPageable } from '@shared-libs';
import { Expose, Type } from 'class-transformer';
import { SalesBillResponseModel } from './sales-bill-response.model';

export class SalesBillsPagedResponseModel implements IPageable<SalesBillResponseModel> {
  @Expose()
  @Type(() => SalesBillResponseModel)
  @ApiProperty({ type: [SalesBillResponseModel] })
  items: SalesBillResponseModel[];

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
