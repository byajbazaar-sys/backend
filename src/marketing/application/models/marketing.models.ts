import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsIn,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { MARKETING_QUALITIES, MARKETING_STYLES } from '../enums';

export class MarketingImageInputModel {
  @ApiProperty({ description: 'Base64 image (optionally a data: URL), max 8 MB' })
  @IsString()
  @MaxLength(12_000_000)
  base64: string;

  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimeType: string;
}

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
}

export class RegenerateSceneRequestModel {
  @ApiProperty({ enum: ['image', 'video'], description: 'image = new image then new video; video = new video only' })
  @IsIn(['image', 'video'])
  target: 'image' | 'video';
}

export class RegenerateBrandRequestModel {
  @ApiProperty({ enum: ['image', 'video', 'both'] })
  @IsIn(['image', 'video', 'both'])
  target: 'image' | 'video' | 'both';
}

export class SceneIndexParamModel {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4)
  index: number;
}

export class MarketingSceneResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() index: number;
  @Expose() @ApiProperty() imagePrompt: string;
  @Expose() @ApiProperty() motionPrompt: string;
  @Expose() @ApiProperty() imageStatus: string;
  @Expose() @ApiProperty() videoStatus: string;
  @Expose() @ApiPropertyOptional() imageUrl?: string;
  @Expose() @ApiPropertyOptional() videoUrl?: string;
  @Expose() @ApiPropertyOptional() error?: string;
}

export class MarketingCampaignResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() title: string;
  @Expose() @ApiProperty() sourceType: string;
  @Expose() @ApiPropertyOptional() inventoryItemId?: string;
  @Expose() @ApiProperty() style: string;
  @Expose() @ApiProperty() quality: string;
  @Expose() @ApiProperty() status: string;
  @Expose() @ApiProperty() progress: number;
  @Expose() @ApiPropertyOptional() stageMessage?: string;
  @Expose() @ApiPropertyOptional() error?: string;
  @Expose() @ApiPropertyOptional() sourceImageUrl?: string;
  @Expose() @ApiPropertyOptional() coverImageUrl?: string;
  @Expose()
  @ApiPropertyOptional({ description: 'All scenes merged with transitions, ending on the logo' })
  mergedVideoUrl?: string;
  @Expose()
  @Type(() => MarketingSceneResponseModel)
  @ApiPropertyOptional({ type: [MarketingSceneResponseModel] })
  scenes?: MarketingSceneResponseModel[];
  @Expose() @Type(() => Date) @ApiProperty() createdAt: Date;
  @Expose() @Type(() => Date) @ApiProperty() updatedAt: Date;
  @Expose() @Type(() => Date) @ApiPropertyOptional() completedAt?: Date;
}

export class MarketingBrandResponseModel {
  @Expose() @ApiProperty() businessName: string;
  @Expose() @ApiProperty() logoImageStatus: string;
  @Expose() @ApiProperty() logoVideoStatus: string;
  @Expose() @ApiPropertyOptional() logoImageUrl?: string;
  @Expose()
  @ApiPropertyOptional({ description: '5 s logo clip, reused at the end of every campaign film' })
  logoVideoUrl?: string;
  @Expose() @ApiPropertyOptional() error?: string;
}

export class MarketingCapacityResponseModel {
  @Expose() @ApiProperty() accounts: number;
  @Expose() @ApiProperty() ready: number;
  @Expose() @ApiProperty() settingUp: number;
  @Expose() @ApiProperty() slots: number;
  @Expose() @ApiProperty() busy: number;
  @Expose() @ApiProperty() waiting: number;
}

export class MarketingInstagramConnectResponseModel {
  @Expose() @ApiProperty() authorizationUrl: string;
}

export class MarketingInstagramConnectionResponseModel {
  @Expose() @ApiProperty() connected: boolean;
  @Expose() @ApiPropertyOptional({ nullable: true }) instagramUserId: string | null;
  @Expose() @ApiPropertyOptional({ nullable: true }) username: string | null;
  @Expose() @Type(() => Date) @ApiPropertyOptional({ nullable: true }) tokenExpiresAt: Date | null;
  @Expose() @Type(() => Date) @ApiPropertyOptional({ nullable: true }) connectedAt: Date | null;
  @Expose() @ApiProperty() requiresReconnect: boolean;
}

/** Message delivered by the marketing queue (QStash). */
export class MarketingQueueMessageModel {
  @ApiProperty({ enum: ['plan', 'image', 'logo', 'dispatch', 'watch', 'photoshoot'] })
  @IsIn(['plan', 'image', 'logo', 'dispatch', 'watch', 'photoshoot'])
  step: 'plan' | 'image' | 'logo' | 'dispatch' | 'watch' | 'photoshoot';

  @ApiPropertyOptional() @IsOptional() @IsUUID() campaignId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(4) sceneIndex?: number;
  @ApiPropertyOptional() @IsOptional() render?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsIn(['image', 'video', 'both']) target?: 'image' | 'video' | 'both';
  @ApiPropertyOptional() @IsOptional() @IsUUID() renderJobId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() photoshootId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(3) shotIndex?: number;
}

/** Progress event from a Kaggle worker notebook (HTTPS fallback of the WebSocket route). */
export class MarketingWorkerEventModel {
  @ApiProperty() @IsUUID() jobId: string;
  @ApiProperty() @IsString() @MaxLength(200) token: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) stage?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() progress?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) message?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['completed', 'failed']) status?: 'completed' | 'failed';
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^(scene-\d|logo)$/) clipKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString({ each: true }) failedClips?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) gpuInfo?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(4) imageIndex?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) imagePrompt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) motionPrompt?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(4, { each: true })
  failedImages?: number[];
}
