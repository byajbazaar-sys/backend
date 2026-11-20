import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsIn,
  IsArray,
  IsBoolean,
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
  /** WebSocket route name; notebooks send the same body over HTTPS. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) action?: string;
  @ApiProperty() @IsUUID() jobId: string;
  @ApiProperty() @IsString() @MaxLength(200) token: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) stage?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() progress?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) message?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['completed', 'failed']) status?: 'completed' | 'failed';
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^(scene-\d|logo)$/) clipKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString({ each: true }) failedClips?: string[];
  /** clipDone: seed of the delivered take (63-bit, so a string) — re-renders a clip exactly. */
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^\d{1,20}$/) seed?: string | null;
  /** clipDone: what the clip's quality check still noticed on the delivered take (empty when clean). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  qualityNotes?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) gpuInfo?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(16) gpuCount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() qualityScore?: number;
  /** Setup: "user/slug" of the private model dataset it published. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) modelsDataset?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) modelsCacheError?: string;
  /** Warm worker: the model dataset was mounted. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() modelsCached?: boolean;
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
