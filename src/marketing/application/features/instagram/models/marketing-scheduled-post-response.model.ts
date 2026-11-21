import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class MarketingScheduledPostItemResponseModel {
  @Expose() @ApiProperty() sourceType: string;
  @Expose() @ApiProperty() sourceId: string;
  @Expose() @ApiPropertyOptional() sourceIndex?: number | null;
  @Expose() @ApiProperty() mediaType: string;
  @Expose() @ApiProperty() title: string;
}

export class InstagramUserTagResponseModel {
  @Expose() @ApiProperty() username: string;
  @Expose() @ApiPropertyOptional() x?: number;
  @Expose() @ApiPropertyOptional() y?: number;
}

export class InstagramPostOptionsResponseModel {
  @Expose() @ApiPropertyOptional() logoOverlay?: boolean;
  @Expose() @ApiPropertyOptional() locationId?: string;
  @Expose() @ApiPropertyOptional() locationName?: string;
  @Expose() @ApiPropertyOptional({ type: [String] }) collaborators?: string[];
  @Expose()
  @Type(() => InstagramUserTagResponseModel)
  @ApiPropertyOptional({ type: [InstagramUserTagResponseModel] })
  userTags?: InstagramUserTagResponseModel[];
  @Expose() @ApiPropertyOptional() altText?: string;
  @Expose() @ApiPropertyOptional() commentsDisabled?: boolean;
  @Expose() @ApiPropertyOptional() firstComment?: string;
  @Expose() @ApiPropertyOptional() shareToFeed?: boolean;
  @Expose() @ApiPropertyOptional() audioName?: string;
  @Expose() @ApiPropertyOptional() thumbOffsetMs?: number;
}

export class MarketingScheduledPostResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty({ enum: ['IMAGE', 'REEL', 'CAROUSEL'] }) mediaType: string;
  @Expose() @ApiProperty() sourceType: string;
  @Expose() @ApiProperty() sourceId: string;
  @Expose() @ApiPropertyOptional() sourceIndex?: number | null;
  @Expose() @ApiProperty() sourceTitle: string;
  @Expose()
  @Type(() => MarketingScheduledPostItemResponseModel)
  @ApiPropertyOptional({ type: [MarketingScheduledPostItemResponseModel] })
  items?: MarketingScheduledPostItemResponseModel[] | null;
  @Expose()
  @Type(() => InstagramPostOptionsResponseModel)
  @ApiPropertyOptional({ type: InstagramPostOptionsResponseModel })
  options?: InstagramPostOptionsResponseModel | null;
  @Expose() @ApiProperty() caption: string;
  @Expose() @Type(() => Date) @ApiProperty() scheduledAt: Date;
  @Expose() @ApiProperty() status: string;
  @Expose() @ApiPropertyOptional() error?: string | null;
  @Expose() @ApiPropertyOptional() warning?: string | null;
  @Expose() @Type(() => Date) @ApiPropertyOptional() publishedAt?: Date | null;
  @Expose() @Type(() => Date) @ApiProperty() createdAt: Date;
}
