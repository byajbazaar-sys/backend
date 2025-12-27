import { ApiProperty } from '@nestjs/swagger';

export class MetaModel {
  @ApiProperty({ type: Number, example: 1 })
  page: number;

  @ApiProperty({ type: Number, example: 10 })
  limit: number;

  @ApiProperty({ type: Number, example: 42 })
  totalItems: number;

  @ApiProperty({ type: Number, example: 5 })
  totalPages: number;
}
