import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

import { KaggleJobStatusResponseModel, MarketingImageInputModel } from './marketing.models';
import {
  PHOTOSHOOT_ASPECTS,
  PHOTOSHOOT_METALS,
  PHOTOSHOOT_MODELS,
  PHOTOSHOOT_OUTFITS,
  PHOTOSHOOT_SETTINGS,
} from '../enums';

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
}

export class PhotoshootShotResponseModel {
  @Expose() @ApiProperty() index: number;
  @Expose() @ApiProperty({ enum: ['present', 'closeup', 'hands', 'worn'] }) kind: string;
  @Expose() @ApiProperty() status: string;
  @Expose() @ApiPropertyOptional() imageUrl?: string;
  @Expose() @ApiPropertyOptional() error?: string;
}

export class PhotoshootPieceResponseModel {
  @Expose() @ApiProperty() noun: string;
  @Expose() @ApiProperty() metal: string;
  @Expose() @ApiProperty() wornOn: string;
}

export class PhotoshootResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() title: string;
  @Expose() @ApiPropertyOptional() inventoryItemId?: string;
  @Expose() @ApiProperty({ enum: ['GENERATING', 'READY', 'PARTIAL', 'FAILED'] }) status: string;
  @Expose() @ApiProperty() setting: string;
  @Expose() @ApiProperty() model: string;
  @Expose() @ApiProperty() outfit: string;
  @Expose() @ApiProperty() aspect: string;
  @Expose()
  @Type(() => PhotoshootPieceResponseModel)
  @ApiProperty({ type: PhotoshootPieceResponseModel })
  piece: PhotoshootPieceResponseModel;
  @Expose() @ApiPropertyOptional() sourceImageUrl?: string;
  @Expose() @ApiPropertyOptional() error?: string;
  @Expose() @ApiProperty() createdAt: Date;
  @Expose()
  @Type(() => PhotoshootShotResponseModel)
  @ApiProperty({ type: [PhotoshootShotResponseModel] })
  shots: PhotoshootShotResponseModel[];
  @Expose()
  @Type(() => KaggleJobStatusResponseModel)
  @ApiPropertyOptional({ type: KaggleJobStatusResponseModel, description: 'Latest Kaggle image-notebook run' })
  imageJob?: KaggleJobStatusResponseModel;
}
