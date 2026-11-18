import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { BillLogResponseModel } from './bill-log-response.model';

export class BillLogsPagedResponseModel {
  @Expose()
  @Type(() => BillLogResponseModel)
  @ApiProperty({ type: [BillLogResponseModel] })
  items: BillLogResponseModel[];

  @Expose() @Type(() => Number) @ApiProperty() page: number;
  @Expose() @Type(() => Number) @ApiProperty() perPage: number;
  @Expose() @Type(() => Number) @ApiProperty() totalPages: number;
  @Expose() @Type(() => Number) @ApiProperty() totalCount: number;
  @Expose() @ApiProperty() hasNextPage: boolean;
  @Expose() @ApiProperty() hasPreviousPage: boolean;
}
