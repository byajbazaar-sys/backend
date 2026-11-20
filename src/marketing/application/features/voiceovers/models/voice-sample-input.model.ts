import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';

/** Audio types a browser upload or recording arrives as. */
export const VOICE_SAMPLE_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
];

export class VoiceSampleInputModel {
  @ApiProperty({ description: 'The voice sample, base64 (a data: URL prefix is fine); at most 6 MB' })
  @IsString()
  @MaxLength(9_000_000)
  base64: string;

  @ApiProperty({ enum: VOICE_SAMPLE_TYPES })
  @IsIn(VOICE_SAMPLE_TYPES)
  mimeType: string;
}
