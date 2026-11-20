import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class VoiceoverSettingsResponseModel {
  @Expose() @ApiPropertyOptional({ description: 'Narration speed (1 = as spoken)' }) speed?: number;
  @Expose() @ApiProperty() exaggeration: number;
  @Expose() @ApiProperty() cfgWeight: number;
  @Expose() @ApiProperty() temperature: number;
  @Expose() @ApiProperty() repetitionPenalty: number;
  @Expose() @ApiProperty() minP: number;
  @Expose() @ApiProperty() topP: number;
  @Expose() @ApiProperty() seed: number;
}
