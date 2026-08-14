import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkDeleteSalesBillsRequestModel {
  @ApiProperty({ type: [String], description: 'Sales bill UUIDs to delete' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];
}

export class BulkDeleteSalesBillsResponseModel {
  @Expose()
  @ApiProperty()
  deletedCount: number;
}
