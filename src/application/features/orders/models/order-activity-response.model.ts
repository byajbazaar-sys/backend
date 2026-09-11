import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { EOrderActivityType, EOrderStatus } from '../enums';

export class OrderActivityResponseModel {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  orderId: string;

  @Expose()
  @ApiProperty()
  createdBy: string;

  @Expose()
  @ApiPropertyOptional()
  createdByFirstName?: string;

  @Expose()
  @ApiPropertyOptional()
  createdByLastName?: string;

  @Expose()
  @ApiProperty({ enum: EOrderActivityType })
  activityType: EOrderActivityType;

  @Expose()
  @ApiPropertyOptional()
  message?: string;

  @Expose()
  @ApiPropertyOptional({ enum: EOrderStatus })
  fromStatus?: EOrderStatus;

  @Expose()
  @ApiPropertyOptional({ enum: EOrderStatus })
  toStatus?: EOrderStatus;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional()
  amount?: number;

  @Expose()
  @ApiPropertyOptional()
  metadata?: Record<string, unknown>;

  @Expose()
  @Type(() => Date)
  @ApiProperty()
  createdAt: Date;
}
