import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { TRY_ON_COLOR_PATTERN } from './try-on-image.constants';
import { TryOnImageModel } from './try-on-image.model';
import { TryOnJewelleryItemModel } from './try-on-jewellery-item.model';

export class CreateTryOnJobRequestModel {
  @Expose()
  @ApiProperty({ type: TryOnImageModel })
  @ValidateNested()
  @Type(() => TryOnImageModel)
  personImage!: TryOnImageModel;

  @Expose()
  @ApiProperty({ type: [TryOnJewelleryItemModel] })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one jewellery item is required' })
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => TryOnJewelleryItemModel)
  jewelleryItems!: TryOnJewelleryItemModel[];

  @Expose()
  @ApiProperty({
    example: 'Saree',
    description: 'Outfit label — catalog name or custom uploaded outfit label',
  })
  @IsString({ message: 'outfit is required' })
  @MinLength(1, { message: 'outfit is required and must be a non-empty string' })
  @MaxLength(128)
  outfit!: string;

  @Expose()
  @ApiPropertyOptional({
    example: 'Wedding',
    description: 'Occasion label — catalog or custom (e.g. Engagement, Reception)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  occasion?: string;

  @Expose()
  @ApiPropertyOptional({
    example: '#AF8F49',
    description: 'Outfit fabric color (hex or name) — mapped to Aivot outfitColor',
  })
  @IsOptional()
  @IsString()
  @Matches(TRY_ON_COLOR_PATTERN, { message: 'invalid color' })
  color?: string;

  @Expose()
  @ApiPropertyOptional({ enum: ['jewellery', 'outfit'], default: 'jewellery' })
  @IsOptional()
  @IsIn(['jewellery', 'outfit'])
  mode?: 'jewellery' | 'outfit';

  @Expose()
  @ApiPropertyOptional({ default: 2, minimum: 1, maximum: 2, description: '1 | 2 variations' })
  @IsOptional()
  @IsNumber({}, { message: 'invalid variation value' })
  @Min(1, { message: 'invalid variation value' })
  @Max(2, { message: 'invalid variation value' })
  variations?: number;

  @Expose()
  @ApiPropertyOptional({
    minimum: 1,
    description: 'Client try-on attempt number (controls AI provider routing)',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  tryOnAttempt?: number;
}
