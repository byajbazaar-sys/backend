import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class BulkUpdateCatalogVisibilityResponseModel {
  @Expose()
  @ApiProperty()
  updatedCount: number;
}
