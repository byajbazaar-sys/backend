import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { PhotoshootPieceResponseModel } from './photoshoot-piece-response.model';
import { PhotoshootShotResponseModel } from './photoshoot-shot-response.model';
import { KaggleJobStatusResponseModel } from '../../../shared';

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
