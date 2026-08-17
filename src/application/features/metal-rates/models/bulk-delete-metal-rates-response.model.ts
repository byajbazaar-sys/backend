import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class BulkDeleteMetalRatesResponseModel {
  @Expose()
  @ApiProperty()
  deletedCount: number;
}
