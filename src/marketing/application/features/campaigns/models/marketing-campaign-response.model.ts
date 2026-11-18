import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { MarketingSceneResponseModel } from './marketing-scene-response.model';
import { KaggleJobStatusResponseModel } from '../../../shared';

export class MarketingCampaignResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() title: string;
  @Expose() @ApiProperty() sourceType: string;
  @Expose() @ApiPropertyOptional() inventoryItemId?: string;
  @Expose() @ApiProperty() style: string;
  @Expose() @ApiProperty() quality: string;
  @Expose() @ApiProperty({ enum: ['exact', 'ai'] }) imageMode: string;
  @Expose() @ApiProperty() status: string;
  @Expose() @ApiProperty() progress: number;
  @Expose() @ApiPropertyOptional() stageMessage?: string;
  @Expose() @ApiPropertyOptional() error?: string;
  @Expose() @ApiPropertyOptional() sourceImageUrl?: string;
  @Expose() @ApiPropertyOptional() coverImageUrl?: string;
  @Expose() @ApiPropertyOptional() coverSceneIndex?: number;
  @Expose()
  @ApiPropertyOptional({ description: 'All scenes merged with transitions, ending on the logo' })
  mergedVideoUrl?: string;
  @Expose()
  @Type(() => MarketingSceneResponseModel)
  @ApiPropertyOptional({ type: [MarketingSceneResponseModel] })
  scenes?: MarketingSceneResponseModel[];
  @Expose()
  @Type(() => KaggleJobStatusResponseModel)
  @ApiPropertyOptional({ type: KaggleJobStatusResponseModel, description: 'Latest Kaggle image-notebook run' })
  imageJob?: KaggleJobStatusResponseModel;
  @Expose()
  @Type(() => KaggleJobStatusResponseModel)
  @ApiPropertyOptional({ type: KaggleJobStatusResponseModel, description: 'Latest Kaggle video-notebook run' })
  videoJob?: KaggleJobStatusResponseModel;
  @Expose() @Type(() => Date) @ApiProperty() createdAt: Date;
  @Expose() @Type(() => Date) @ApiProperty() updatedAt: Date;
  @Expose() @Type(() => Date) @ApiPropertyOptional() completedAt?: Date;
}
