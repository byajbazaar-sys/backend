import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

import {
  MARKETING_IMAGE_MODES,
  PHOTOSHOOT_ASPECTS,
  PHOTOSHOOT_METALS,
  PHOTOSHOOT_MODELS,
  PHOTOSHOOT_OUTFITS,
  PHOTOSHOOT_SETTINGS,
  MarketingImageInputModel,
} from '../../../shared';

export class CreatePhotoshootRequestModel {
  @ApiPropertyOptional({ description: 'Use this inventory item’s photo' })
  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;

  @ApiPropertyOptional({ type: MarketingImageInputModel, description: 'Or upload a photo' })
  @IsOptional()
  @ValidateNested()
  @Type(() => MarketingImageInputModel)
  image?: MarketingImageInputModel;

  @ApiPropertyOptional({ description: 'Product name (defaults to the item name)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ description: 'What the piece is (necklace, earrings, ring, bangle, kada, …)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  pieceType?: string;

  @ApiPropertyOptional({ enum: PHOTOSHOOT_METALS })
  @IsOptional()
  @IsIn(PHOTOSHOOT_METALS)
  metal?: string;

  @ApiPropertyOptional({ enum: PHOTOSHOOT_SETTINGS, default: 'showroom' })
  @IsOptional()
  @IsIn(PHOTOSHOOT_SETTINGS)
  setting?: string;

  @ApiPropertyOptional({ enum: PHOTOSHOOT_MODELS, default: 'woman' })
  @IsOptional()
  @IsIn(PHOTOSHOOT_MODELS)
  model?: string;

  @ApiPropertyOptional({ enum: PHOTOSHOOT_OUTFITS, default: 'kurta' })
  @IsOptional()
  @IsIn(PHOTOSHOOT_OUTFITS)
  outfit?: string;

  @ApiPropertyOptional({ enum: Object.keys(PHOTOSHOOT_ASPECTS), default: '3:4' })
  @IsOptional()
  @IsIn(Object.keys(PHOTOSHOOT_ASPECTS))
  aspect?: string;

  @ApiPropertyOptional({
    enum: MARKETING_IMAGE_MODES,
    default: 'exact',
    description: 'exact = cut out the real product and only change the background; ai = full AI scene',
  })
  @IsOptional()
  @IsIn(MARKETING_IMAGE_MODES)
  imageMode?: string;
}
