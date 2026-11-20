import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';

import { VoiceSampleInputModel } from './voice-sample-input.model';
import { VoiceoverSettingsRequestModel } from './voiceover-settings-request.model';
import { VOICE_LANGUAGE_CODES } from '../../../shared';

export class CreateVoiceoverRequestModel {
  @ApiPropertyOptional({ description: 'A name for the list (defaults to the start of the text)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiProperty({ description: 'What to say', maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text: string;

  @ApiProperty({ enum: VOICE_LANGUAGE_CODES, description: 'Language of the text' })
  @IsIn(VOICE_LANGUAGE_CODES)
  language: string;

  @ApiPropertyOptional({ type: VoiceSampleInputModel, description: 'The voice to clone: 6+ seconds of clear speech' })
  @IsOptional()
  @ValidateNested()
  @Type(() => VoiceSampleInputModel)
  sample?: VoiceSampleInputModel;

  @ApiPropertyOptional({ description: 'Or reuse the voice sample of one of your earlier voiceovers' })
  @IsOptional()
  @IsUUID()
  sampleFromId?: string;

  @ApiPropertyOptional({ type: VoiceoverSettingsRequestModel })
  @IsOptional()
  @ValidateNested()
  @Type(() => VoiceoverSettingsRequestModel)
  settings?: VoiceoverSettingsRequestModel;
}
