import { Transform, TransformFnParams } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, Equals, IsArray, IsInt, IsObject } from 'class-validator';

/**
 * Templates and printer profiles are free-form JSON documents owned by the clients.
 * The global ValidationPipe uses `enableImplicitConversion`, which converts each element of a
 * `Record<string, unknown>[]` property into an Array (the reflected design type), so
 * `@IsObject({ each: true })` would always fail. Keep the raw request value instead.
 */
const keepRawJson = ({ obj, key }: TransformFnParams): unknown => (obj as Record<string, unknown>)[key];

export class SaveLabelDesignerSettingsModel {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Equals(1)
  schemaVersion: number;

  @ApiProperty({ type: [Object], description: 'Saved jewellery label templates for this user/shop.' })
  @Transform(keepRawJson)
  @IsArray()
  @ArrayMaxSize(100)
  @IsObject({ each: true })
  templates: Record<string, unknown>[];

  @ApiProperty({ type: [Object], description: 'Printer profiles configured for this user/shop.' })
  @Transform(keepRawJson)
  @IsArray()
  @ArrayMaxSize(20)
  @IsObject({ each: true })
  printerProfiles: Record<string, unknown>[];
}
