import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsUUID } from 'class-validator';

export class BulkUpdateCatalogVisibilityRequestModel {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({ example: true })
  @IsBoolean()
  isCatalogVisible: boolean;
}
