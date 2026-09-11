import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { OrderResponseModel } from './order-response.model';

class OrdersPagedMetaModel {
  @Expose()
  @ApiProperty()
  page: number;

  @Expose()
  @ApiProperty()
  limit: number;

  @Expose()
  @ApiProperty()
  totalItems: number;

  @Expose()
  @ApiProperty()
  totalPages: number;
}

export class OrdersPagedResponseModel {
  @Expose()
  @Type(() => OrderResponseModel)
  @ApiProperty({ type: [OrderResponseModel] })
  items: OrderResponseModel[];

  @Expose()
  @Type(() => OrdersPagedMetaModel)
  @ApiProperty()
  meta: OrdersPagedMetaModel;
}
