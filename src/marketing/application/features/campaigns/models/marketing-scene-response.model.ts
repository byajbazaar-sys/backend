import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { CustomerErrorText } from '../../../shared/utils/customer-text';
export class MarketingSceneResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() index: number;
  @Expose() @ApiProperty() imagePrompt: string;
  @Expose() @ApiProperty() motionPrompt: string;
  @Expose() @ApiProperty() imageStatus: string;
  @Expose() @ApiProperty() videoStatus: string;
  @Expose() @ApiPropertyOptional() imageUrl?: string;
  @Expose() @ApiPropertyOptional() videoUrl?: string;
  @Expose() @CustomerErrorText() @ApiPropertyOptional() error?: string;
}
