import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

import {
  MARKETING_IMAGE_MODES,
  MARKETING_QUALITIES,
  MARKETING_STYLES,
  MarketingImageInputModel,
} from '../../../shared';

export class CreateCampaignRequestModel {
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

  @ApiPropertyOptional({ enum: MARKETING_STYLES, default: 'studio' })
  @IsOptional()
  @IsIn(MARKETING_STYLES)
  style?: string;

  @ApiPropertyOptional({ enum: MARKETING_QUALITIES, default: 'fast' })
  @IsOptional()
  @IsIn(MARKETING_QUALITIES)
  quality?: string;

  @ApiPropertyOptional({
    enum: MARKETING_IMAGE_MODES,
    default: 'exact',
    description: 'exact = cut out the real product and only change the background; ai = full AI scene',
  })
  @IsOptional()
  @IsIn(MARKETING_IMAGE_MODES)
  imageMode?: string;
}
