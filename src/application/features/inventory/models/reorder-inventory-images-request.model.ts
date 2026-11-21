import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';

/** Every photo id of the item, in the new order (the first becomes the cover). */
export class ReorderInventoryImagesRequestModel {
  @ApiProperty({ type: [String], maxItems: 8 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  imageIds: string[];
}
