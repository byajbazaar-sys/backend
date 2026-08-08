import { Expose } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ESubscriptionStatus } from '../domain';

export class AdminSubscriptionListItemModel {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  userName!: string;

  @Expose()
  @ApiProperty()
  email!: string;

  @Expose()
  @ApiPropertyOptional()
  planName?: string;

  @Expose()
  @ApiProperty({ enum: ESubscriptionStatus })
  status!: ESubscriptionStatus;

  @Expose()
  @ApiPropertyOptional()
  currentStart?: Date;

  @Expose()
  @ApiPropertyOptional()
  currentEnd?: Date;

  @Expose()
  @ApiPropertyOptional()
  nextBillingAt?: Date;

  @Expose()
  @ApiPropertyOptional()
  providerSubscriptionId?: string;

  @Expose()
  @ApiProperty()
  createdAt!: Date;
}

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
