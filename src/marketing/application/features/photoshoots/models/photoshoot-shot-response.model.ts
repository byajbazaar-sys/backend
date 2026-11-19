import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { CustomerErrorText } from '../../../shared/utils/customer-text';
export class PhotoshootShotResponseModel {
  @Expose() @ApiProperty() index: number;
  @Expose() @ApiProperty({ enum: ['present', 'closeup', 'hands', 'worn'] }) kind: string;
  @Expose() @ApiProperty() status: string;
  @Expose() @ApiPropertyOptional() imageUrl?: string;
  @Expose() @CustomerErrorText() @ApiPropertyOptional() error?: string;
}
