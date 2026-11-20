import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** The ChatterBox Multilingual node's settings, with its ranges (defaults as in ComfyUI). */
export class VoiceoverSettingsRequestModel {
  @ApiPropertyOptional({ minimum: 0.7, maximum: 1.4, default: 1, description: 'Narration speed (pitch unchanged)' })
  @IsOptional()
  @IsNumber()
  @Min(0.7)
  @Max(1.4)
  speed?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 2, default: 0.5, description: 'Emotion intensity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  exaggeration?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, default: 0.5, description: 'Classifier-free guidance' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  cfgWeight?: number;

  @ApiPropertyOptional({ minimum: 0.05, maximum: 2, default: 0.8 })
  @IsOptional()
  @IsNumber()
  @Min(0.05)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, default: 2 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  repetitionPenalty?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, default: 0.05 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minP?: number;

  @ApiPropertyOptional({ minimum: 0.1, maximum: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1)
  topP?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 4294967295, description: 'Same seed + same inputs = the same take' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4294967295)
  seed?: number;
}
