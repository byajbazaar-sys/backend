import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class OrderStatsResponseModel {
  @Expose()
  @Type(() => Number)
  @ApiProperty()
  total: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  new: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  inProgress: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  ready: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  overdue: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  completed: number;
}
