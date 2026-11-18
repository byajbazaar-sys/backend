import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
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
