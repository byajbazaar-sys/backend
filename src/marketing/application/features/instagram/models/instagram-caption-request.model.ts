import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { ScheduleMarketingPostItemModel } from './schedule-marketing-post-request.model';
import { CAPTION_LANGUAGE_CODES, CAPTION_TONES, CaptionLanguage, CaptionTone } from '../utils';

export class InstagramCaptionRequestModel {
  @ApiProperty({ type: [ScheduleMarketingPostItemModel], minItems: 1, maxItems: 10 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ScheduleMarketingPostItemModel)
  items: ScheduleMarketingPostItemModel[];

  @ApiProperty({ enum: CAPTION_LANGUAGE_CODES })
  @IsIn(CAPTION_LANGUAGE_CODES)
  language: CaptionLanguage;

  @ApiPropertyOptional({ enum: CAPTION_TONES })
  @IsOptional()
  @IsIn(CAPTION_TONES)
  tone?: CaptionTone;

  @ApiPropertyOptional({ format: 'date-time', description: 'When the post goes out (picks the special day)' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ enum: ['auto', 'none', 'custom'] })
  @IsOptional()
  @IsIn(['auto', 'none', 'custom'])
  occasion?: 'auto' | 'none' | 'custom';

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  occasionText?: string;
}

export class InstagramPlacesQueryModel {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  q: string;
}
