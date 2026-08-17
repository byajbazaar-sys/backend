import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { AdminSubscriptionListItemModel } from './admin-subscription-list-item.model';

export class AdminSubscriptionsPagedResponseModel {
  @Expose()
  @ApiProperty({ type: [AdminSubscriptionListItemModel] })
  items!: AdminSubscriptionListItemModel[];

  @Expose()
  @ApiProperty()
  page!: number;

  @Expose()
  @ApiProperty()
  perPage!: number;

  @Expose()
  @ApiProperty()
  totalCount!: number;

  @Expose()
  @ApiProperty()
  totalPages!: number;
}
