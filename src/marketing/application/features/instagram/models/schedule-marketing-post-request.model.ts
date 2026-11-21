import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
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

/** Instagram usernames: letters, digits, dots and underscores (no @). */
const USERNAME = /^[A-Za-z0-9._]{1,30}$/;

/** One library photo or video. */
export class ScheduleMarketingPostItemModel {
  @ApiProperty({ enum: ['campaign', 'photoshoot'] })
  @IsIn(['campaign', 'photoshoot'])
  sourceType: 'campaign' | 'photoshoot';

  @ApiProperty()
  @IsUUID()
  sourceId: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 4 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  sourceIndex?: number;

  @ApiProperty({ enum: ['IMAGE', 'REEL'] })
  @IsIn(['IMAGE', 'REEL'])
  mediaType: 'IMAGE' | 'REEL';
}

export class InstagramUserTagModel {
  @ApiProperty({ description: 'Instagram username without @' })
  @Matches(USERNAME, { message: 'Use a valid Instagram username (letters, numbers, . and _).' })
  username: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  x?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  y?: number;
}

/** Instagram publishing options (Graph API). */
export class InstagramPostOptionsModel {
  @ApiPropertyOptional({ description: 'Shop logo on the photos (top-left); unset follows the brand kit switch' })
  @IsOptional()
  @IsBoolean()
  logoOverlay?: boolean;

  @ApiPropertyOptional({ description: 'Facebook Page ID of the place to tag' })
  @IsOptional()
  @Matches(/^\d{3,32}$/, { message: 'The location must be a numeric place ID.' })
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationName?: string;

  @ApiPropertyOptional({ maxItems: 3 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @Matches(USERNAME, { each: true, message: 'Use valid Instagram usernames for collaborators.' })
  collaborators?: string[];

  @ApiPropertyOptional({ type: [InstagramUserTagModel], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => InstagramUserTagModel)
  userTags?: InstagramUserTagModel[];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  altText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  commentsDisabled?: boolean;

  @ApiPropertyOptional({ maxLength: 2200 })
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  firstComment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shareToFeed?: boolean;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  audioName?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600_000)
  thumbOffsetMs?: number;
}

/**
 * One post. The top-level source fields name the media of a single photo / reel; with `items` (2–10) the post is a
 * carousel and the top-level fields repeat its first item.
 */
export class ScheduleMarketingPostRequestModel extends ScheduleMarketingPostItemModel {
  @ApiPropertyOptional({ type: [ScheduleMarketingPostItemModel], minItems: 2, maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ScheduleMarketingPostItemModel)
  items?: ScheduleMarketingPostItemModel[];

  @ApiPropertyOptional({ type: InstagramPostOptionsModel })
  @IsOptional()
  @ValidateNested()
  @Type(() => InstagramPostOptionsModel)
  options?: InstagramPostOptionsModel;

  @ApiProperty({ maxLength: 2200 })
  @IsString()
  @MaxLength(2200)
  caption: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  scheduledAt: string;
}
