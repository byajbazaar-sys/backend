import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class BulkDeleteInventoryItemsResponseModel {
  @Expose()
  @ApiProperty()
  deletedCount: number;
}
