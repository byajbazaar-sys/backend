import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, IsDateString, Max, MaxLength, Min } from 'class-validator';
export class ScheduleMarketingPostRequestModel {
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

  @ApiProperty({ maxLength: 2200 })
  @IsString()
  @MaxLength(2200)
  caption: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  scheduledAt: string;
}
