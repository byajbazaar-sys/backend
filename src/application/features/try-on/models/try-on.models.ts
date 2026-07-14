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

const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

export const TRY_ON_ASSET_TYPES = ['necklace', 'earring', 'outfit', 'occasion'] as const;
export type TryOnAssetType = (typeof TRY_ON_ASSET_TYPES)[number];

/** Hex (#RGB / #RRGGBB) or a short color name used by the frontend catalog. */
const COLOR_PATTERN = /^(#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?|[A-Za-z][A-Za-z0-9 \-]{1,30})$/;

export class TryOnImageModel {
  @Expose()
  @ApiProperty({ description: 'Base64 image data (with or without data-URL prefix)' })
  @IsString()
  @MinLength(32, { message: 'personImage / jewellery image data is required' })
  base64!: string;

  @Expose()
  @ApiProperty({ example: 'image/jpeg', enum: ALLOWED_IMAGE_MIME })
  @IsString()
  @IsIn(ALLOWED_IMAGE_MIME, { message: 'invalid image type' })
  mimeType!: string;
}

export class TryOnJewelleryItemModel extends TryOnImageModel {
  @Expose()
  @ApiProperty({ enum: ['necklace', 'earring', 'bracelet', 'ring', 'other'] })
  @IsIn(['necklace', 'earring', 'bracelet', 'ring', 'other'])
  type!: 'necklace' | 'earring' | 'bracelet' | 'ring' | 'other';

  @Expose()
  @ApiPropertyOptional({ description: 'Physical height in inches for proportion lock' })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(24)
  heightInInches?: number;
}

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
  @Matches(COLOR_PATTERN, { message: 'invalid color' })
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
}

export class RecolorTryOnRequestModel {
  @Expose()
  @ApiProperty({ type: TryOnImageModel })
  @ValidateNested()
  @Type(() => TryOnImageModel)
  image!: TryOnImageModel;

  @Expose()
  @ApiProperty({ example: '#C9A227' })
  @IsString()
  @MinLength(2)
  @Matches(COLOR_PATTERN, { message: 'invalid color' })
  color!: string;
}

export class TryOnAssetResponseModel {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty({ enum: TRY_ON_ASSET_TYPES })
  type!: TryOnAssetType;

  @Expose()
  @ApiProperty()
  imageUrl!: string;

  @Expose()
  @ApiProperty()
  imageKey!: string;

  @Expose()
  @ApiPropertyOptional()
  label?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Height / length in inches (jewellery proportion lock)' })
  heightInInches?: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Default outfit color hex for custom outfits' })
  color?: string;

  @Expose()
  @ApiPropertyOptional()
  createdAt?: string;
}

export class TryOnAssetsListResponseModel {
  @Expose()
  @ApiProperty({ type: [TryOnAssetResponseModel] })
  @Type(() => TryOnAssetResponseModel)
  items!: TryOnAssetResponseModel[];
}

export class GeneratedImageResponseModel {
  @Expose()
  @ApiProperty()
  base64!: string;

  @Expose()
  @ApiProperty()
  mimeType!: string;
}

export class TryOnJobResponseModel {
  @Expose()
  @ApiProperty()
  jobId!: string;

  @Expose()
  @ApiProperty({ enum: ['PENDING', 'COMPLETED', 'FAILED'] })
  status!: 'PENDING' | 'COMPLETED' | 'FAILED';

  @Expose()
  @ApiPropertyOptional()
  error?: string;

  @Expose()
  @ApiPropertyOptional({ type: [GeneratedImageResponseModel] })
  @Type(() => GeneratedImageResponseModel)
  images?: GeneratedImageResponseModel[];

  @Expose()
  @ApiPropertyOptional()
  createdAt?: string;

  @Expose()
  @ApiPropertyOptional()
  updatedAt?: string;
}
