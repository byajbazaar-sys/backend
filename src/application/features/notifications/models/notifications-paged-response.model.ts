import { ApiProperty } from '@nestjs/swagger';
import { NotificationResponseModel } from './notification-response.model';

export class NotificationsPagedResponseModel {
  @ApiProperty({ type: [NotificationResponseModel] })
  items: NotificationResponseModel[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  perPage: number;

  @ApiProperty()
  totalCount: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  hasNextPage: boolean;

  @ApiProperty()
  hasPreviousPage: boolean;
}
