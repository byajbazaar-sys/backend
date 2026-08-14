import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkDeleteMetalRatesRequestModel {
  @ApiProperty({ type: [String], description: 'Metal rate history entry UUIDs to delete' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];
}

export class BulkDeleteMetalRatesResponseModel {
  @Expose()
  @ApiProperty()
  deletedCount: number;
}
