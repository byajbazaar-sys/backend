import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { VoiceoverSettingsResponseModel } from './voiceover-settings-response.model';
import { KaggleJobStatusResponseModel } from '../../../shared';
import { CustomerErrorText } from '../../../shared/utils/customer-text';

export class VoiceoverResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() title: string;
  @Expose() @ApiProperty() text: string;
  @Expose() @ApiProperty() language: string;
  @Expose()
  @Type(() => VoiceoverSettingsResponseModel)
  @ApiProperty({ type: VoiceoverSettingsResponseModel })
  settings: VoiceoverSettingsResponseModel;
  @Expose() @ApiProperty({ enum: ['GENERATING', 'READY', 'FAILED'] }) status: string;
  @Expose() @ApiPropertyOptional({ description: 'The generated speech (MP3)' }) audioUrl?: string;
  @Expose() @ApiPropertyOptional({ description: 'The voice sample it was cloned from' }) sampleUrl?: string;
  @Expose() @CustomerErrorText() @ApiPropertyOptional() error?: string;
  @Expose() @ApiProperty() createdAt: Date;
  @Expose()
  @Type(() => KaggleJobStatusResponseModel)
  @ApiPropertyOptional({ type: KaggleJobStatusResponseModel, description: 'Latest voice-notebook run' })
  voiceJob?: KaggleJobStatusResponseModel;
}
