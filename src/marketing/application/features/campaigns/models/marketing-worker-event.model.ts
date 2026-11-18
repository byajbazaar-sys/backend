import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
} from 'class-validator';
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
