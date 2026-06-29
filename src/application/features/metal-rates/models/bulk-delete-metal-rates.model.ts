import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { Expose } from 'class-transformer';

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
