import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class MetaModel {
  @Type(() => Number)
  @ApiProperty({ type: Number, example: 1 })
  page: number;

  @Type(() => Number)
  @ApiProperty({ type: Number, example: 10 })
  limit: number;

  @Type(() => Number)
  @ApiProperty({ type: Number, example: 42 })
  totalItems: number;

  @Type(() => Number)
  @ApiProperty({ type: Number, example: 5 })
  totalPages: number;
}
