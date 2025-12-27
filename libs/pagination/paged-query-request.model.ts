import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { ESortOrder } from '../enums';
import { isArray } from 'class-validator';

export class PagedQueryRequestModel {
  @Expose()
  @ApiProperty({ type: [String], example: [], required: false })
  @Transform(({ value }) => (!isArray(value) && value ? [value] : value))
  ids?: string[];

  @Expose()
  @ApiProperty({ example: 10, required: false })
  pageSize?: number;

  @Expose()
  @ApiProperty({ example: 0, required: false })
  pageNumber?: number;

  @Expose()
  @ApiProperty({ enum: ESortOrder, example: ESortOrder.DESC, required: false })
  sortOrder?: ESortOrder;

  @Expose()
  @ApiProperty({ example: 'createdAt', required: false })
  sortField?: string;
}
