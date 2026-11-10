import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, Equals, IsArray, IsInt, IsObject } from 'class-validator';

export class SaveLabelDesignerSettingsModel {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Equals(1)
  schemaVersion: number;

  @ApiProperty({ type: [Object], description: 'Saved jewellery label templates for this user/shop.' })
  @IsArray()
  @ArrayMaxSize(100)
  @IsObject({ each: true })
  templates: Record<string, unknown>[];

  @ApiProperty({ type: [Object], description: 'Printer profiles configured for this user/shop.' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsObject({ each: true })
  printerProfiles: Record<string, unknown>[];
}
