import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkDeleteInventoryItemsRequestModel {
  @ApiProperty({ type: [String], description: 'Inventory item UUIDs to delete' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];
}

export class BulkDeleteInventoryItemsResponseModel {
  @Expose()
  @ApiProperty()
  deletedCount: number;
}
