import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { NotificationResponseModel } from './notification-response.model';

export class NotificationsPagedResponseModel {
  @ApiProperty({ type: [NotificationResponseModel] })
  items: NotificationResponseModel[];

  @Type(() => Number)
  @ApiProperty()
  page: number;

  @Type(() => Number)
  @ApiProperty()
  perPage: number;

  @Type(() => Number)
  @ApiProperty()
  totalCount: number;

  @Type(() => Number)
  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  hasNextPage: boolean;

  @ApiProperty()
  hasPreviousPage: boolean;
}
