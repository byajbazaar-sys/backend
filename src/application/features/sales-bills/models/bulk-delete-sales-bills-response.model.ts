import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class BulkDeleteSalesBillsResponseModel {
  @Expose()
  @ApiProperty()
  deletedCount: number;
}
