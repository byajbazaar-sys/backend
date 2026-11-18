import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { ActivityLogResponseModel } from './activity-log-response.model';

export class ActivityLogsPagedResponseModel {
  @Expose()
  @Type(() => ActivityLogResponseModel)
  @ApiProperty({ type: [ActivityLogResponseModel] })
  items: ActivityLogResponseModel[];

  @Expose() @Type(() => Number) @ApiProperty() page: number;
  @Expose() @Type(() => Number) @ApiProperty() perPage: number;
  @Expose() @Type(() => Number) @ApiProperty() totalPages: number;
  @Expose() @Type(() => Number) @ApiProperty() totalCount: number;
  @Expose() @ApiProperty() hasNextPage: boolean;
  @Expose() @ApiProperty() hasPreviousPage: boolean;
}
